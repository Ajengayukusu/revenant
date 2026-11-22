/*
 * REVENANT — pypi.js
 * Pure logic for the Python dependency autopsy: requirements.txt and
 * pyproject.toml parsing, PyPI registry result classification, and the
 * dependency health summary. No DOM, no fetch — all network access lives
 * in app.js, which feeds registry responses in here as plain data.
 *
 * Browser-global: window.RevenantPypi. Node: require()-able (UMD guard,
 * same pattern as score.js / deps.js).
 *
 * Python dependency health (0–100, higher = healthier) — a REPORT FIGURE ONLY.
 * It does NOT feed the Resurrection Score in score.js; the score formula
 * there is a documented promise and is unchanged by this module.
 *
 *   health = clamp(round(100 − 0.7 × outdatedPct − 0.3 × stalePct))
 *     outdatedPct = outdated deps / deps with a known status
 *     stalePct    = stale deps / all deps
 *   health is null when there are no dependencies at all.
 *
 * Invariant (unit-tested): marking a dependency stale never raises the
 * health of the same dependency set.
 *
 * Version comparison notes
 * ------------------------
 * PEP 440 is rich, but the vast majority of PyPI versions in the wild are
 * plain x.y.z (or x.y, or x). Pre-release and local-version suffixes
 * (e.g. "1.2.3a1", "1.2.3.post1", "1.2.3+local") are stripped before
 * comparison — this is intentional and documented here. The comparison is
 * therefore an approximation; it is accurate for the common case and
 * conservative: a pre-release declared minimum is treated as the numeric
 * part only, so it may be reported outdated when the numeric parts are equal.
 *
 * pyproject.toml parsing notes
 * ----------------------------
 * parsePyprojectDependencies is NOT a general TOML parser. It handles only
 * the [project] table's `dependencies` key, whose value must be a TOML
 * inline array or a multi-line array of double-quoted strings. Any other
 * TOML construct (arrays of tables, inline tables, single-quoted strings,
 * heredocs, etc.) is out of scope and will be silently skipped.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RevenantPypi = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Split a PEP 508 dependency string into { name, spec }.
   * "requests>=2.0,<3"  -> { name: "requests", spec: ">=2.0,<3" }
   * "flask"             -> { name: "flask",    spec: null }
   * "Pillow[jpeg]>=9"   -> { name: "Pillow",   spec: ">=9" }
   * Returns null for empty / unparseable strings.
   * @param {string} entry
   * @returns {{ name: string, spec: string|null }|null}
   */
  function parseDependencyEntry(entry) {
    if (typeof entry !== 'string') return null;
    // Drop environment markers (anything after ";")
    var noMarker = entry.split(';')[0].trim();
    if (!noMarker) return null;
    // Drop extras: "name[extra1,extra2]..." -> "name..."
    var noExtras = noMarker.replace(/\[.*?\]/g, '');
    // Split at first version-specifier character
    var match = noExtras.match(/^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)\s*(==|!=|<=|>=|~=|<|>|===|$)(.*)/);
    if (!match) return null;
    var name = match[1];
    var op = match[3];
    var rest = match[4];
    var spec = op ? (op + rest).trim() : null;
    if (!spec) spec = null;
    return { name: name, spec: spec };
  }

  /**
   * Extract the smallest plain version from a PEP 508 specifier string.
   * "==1.2.3"        -> "1.2.3"
   * ">=1.0,<2"       -> "1.0"
   * "~=2.1"          -> "2.1"
   * ">=1.0.0,<2.0"   -> "1.0.0"
   * Returns null when no plain version is found.
   * Pre-release / post-release suffixes (a, b, rc, .post, .dev) are stripped.
   * @param {string|null} spec
   * @returns {string|null}
   */
  function extractMinVersion(spec) {
    if (!spec) return null;
    // Find all version numbers in the spec (after any operator)
    var versions = [];
    var re = /(?:==|>=|~=|<=|<|>|!=|===)?\s*(\d+(?:\.\d+)*)/g;
    var m;
    while ((m = re.exec(spec)) !== null) {
      // Strip pre/post/dev suffixes: "1.2.3a1" -> "1.2.3", "2.0.post1" -> "2.0"
      var plain = m[1].replace(/[._-]?(a|b|rc|alpha|beta|post|dev)\d*$/i, '');
      versions.push(plain);
    }
    if (versions.length === 0) return null;
    // Return the smallest
    return versions.reduce(function (min, v) {
      return compareVersionStrings(v, min) < 0 ? v : min;
    });
  }

  /**
   * Parse a plain version string "x.y.z" (or "x.y" or "x") into
   * { major, minor, patch } or null.
   * @param {string} text
   * @returns {{ major: number, minor: number, patch: number }|null}
   */
  function parseVersionParts(text) {
    if (typeof text !== 'string') return null;
    var stripped = text.trim().replace(/[._-]?(a|b|rc|alpha|beta|post|dev)\d*$/i, '');
    var match = stripped.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))*$/);
    if (!match) return null;
    return {
      major: Number(match[1]),
      minor: match[2] != null ? Number(match[2]) : 0,
      patch: match[3] != null ? Number(match[3]) : 0
    };
  }

  /**
   * Compare two plain version strings. Returns -1, 0, 1, or null if either
   * is unparseable.
   * @param {string} a
   * @param {string} b
   * @returns {-1|0|1|null}
   */
  function compareVersionStrings(a, b) {
    var va = parseVersionParts(a);
    var vb = parseVersionParts(b);
    if (!va || !vb) return null;
    if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
    if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
    if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;
    return 0;
  }

  // -----------------------------------------------------------------------
  // Task 1: parseRequirementsTxt
  // -----------------------------------------------------------------------

  /**
   * Parse a requirements.txt file into a list of dependency entries.
   *
   * Rules:
   * - Blank lines are skipped.
   * - Lines where the first non-whitespace character is '#' are skipped
   *   (full-line comments).
   * - Lines starting with '-' (options: -r, -c, -e, -i, --index-url, etc.)
   *   are skipped, including editable installs (-e).
   * - Trailing '#' comments are stripped before parsing.
   * - Environment markers after ';' are dropped (handled in parseDependencyEntry).
   * - Extras ("name[extra]") are stripped to the bare package name.
   * - Continuation lines ('\\' at end of line) are joined before parsing.
   *
   * @param {string} text
   * @returns {Array<{ name: string, spec: string|null }>}
   */
  function parseRequirementsTxt(text) {
    if (typeof text !== 'string') return [];
    // Join continuation lines
    var joined = text.replace(/\\\r?\n/g, ' ');
    var lines = joined.split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.charAt(0) === '#') continue;
      if (line.charAt(0) === '-') continue;
      // Strip trailing comment
      // Be careful: '#' inside a URL or version specifier is very rare, but we
      // split only on ' #' or '\t#' to reduce false positives.
      var commentIdx = line.search(/\s#/);
      if (commentIdx !== -1) {
        line = line.substring(0, commentIdx).trim();
      }
      if (!line) continue;
      var entry = parseDependencyEntry(line);
      if (entry) out.push(entry);
    }
    return out;
  }

  // -----------------------------------------------------------------------
  // Task 2: parsePyprojectDependencies
  // -----------------------------------------------------------------------

  /**
   * Extract the `dependencies` list from a pyproject.toml file's [project]
   * table. This is NOT a general TOML parser — it handles only the common
   * case of a [project] section with a `dependencies` key whose value is an
   * array of double-quoted strings (possibly spread over multiple lines).
   *
   * Single-quoted strings, arrays of tables, inline tables, and other TOML
   * constructs are out of scope.
   *
   * @param {string} text
   * @returns {Array<{ name: string, spec: string|null }>}
   */
  function parsePyprojectDependencies(text) {
    if (typeof text !== 'string') return [];

    // Find the [project] table. We scan for a line that is exactly
    // "[project]" (optional surrounding whitespace), then stop at the
    // next table header "[...something...]".
    var lines = text.split(/\r?\n/);
    var inProject = false;
    var inDepsArray = false;
    var depsLines = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      // Detect section headers
      if (/^\[/.test(trimmed)) {
        if (/^\[project\]$/i.test(trimmed)) {
          inProject = true;
          inDepsArray = false;
          continue;
        } else if (inProject) {
          // A new section header ends the [project] table, unless it is
          // [project.something] (sub-table of project, which we also read).
          if (!/^\[project\./i.test(trimmed)) {
            // But if we were mid-array, that array can't straddle sections.
            inProject = false;
            inDepsArray = false;
          }
        }
        continue;
      }

      if (!inProject) continue;

      if (!inDepsArray) {
        // Look for: dependencies = [
        if (/^dependencies\s*=\s*\[/.test(trimmed)) {
          inDepsArray = true;
          // Grab content after '[' on the same line
          var afterBracket = trimmed.replace(/^dependencies\s*=\s*\[/, '');
          // Check if array closes on same line
          var closingIdx = afterBracket.indexOf(']');
          if (closingIdx !== -1) {
            depsLines.push(afterBracket.substring(0, closingIdx));
            inDepsArray = false;
          } else {
            depsLines.push(afterBracket);
          }
        }
      } else {
        // Inside the array — collect until a bare ']' that is not inside
        // a quoted string. Array entries are double-quoted strings; a line
        // that starts with '"' is an entry line and its ']' characters are
        // part of extras or specifiers, not the array close.
        // A bare ']' is a line that trims to exactly ']' (possibly with a
        // trailing comma), or a line that starts with ']'.
        var isBareClose = /^\]\s*,?\s*$/.test(trimmed) || trimmed.charAt(0) === ']';
        if (isBareClose) {
          // Grab anything before the ']' on the same line (usually nothing)
          var closeIdx = trimmed.indexOf(']');
          var before = trimmed.substring(0, closeIdx).trim();
          if (before) depsLines.push(before);
          inDepsArray = false;
        } else {
          depsLines.push(trimmed);
        }
      }
    }

    // depsLines now contains the raw content of the array; extract quoted strings.
    var combined = depsLines.join('\n');
    var out = [];
    var strRe = /"([^"\\]*)"/g;
    var m;
    while ((m = strRe.exec(combined)) !== null) {
      var entryStr = m[1].trim();
      if (!entryStr) continue;
      var entry = parseDependencyEntry(entryStr);
      if (entry) out.push(entry);
    }
    return out;
  }

  // -----------------------------------------------------------------------
  // Task 3: classifyPypiDependency
  // -----------------------------------------------------------------------

  /**
   * Classify one dependency against the latest PyPI registry version.
   *
   * @param {{ name: string, declaredMin: string|null,
   *            latestVersion: string|null,
   *            latestReleaseMonthsAgo: number|null }} input
   * @returns {{ name: string, status: 'current'|'outdated'|'unknown',
   *             stale: boolean }}
   *
   * status rules:
   *   'unknown'  — declaredMin or latestVersion is null/unparseable
   *   'outdated' — declaredMin < latestVersion (by major/minor/patch)
   *   'current'  — declaredMin >= latestVersion
   *
   * stale: true when latestReleaseMonthsAgo > 36 (strictly greater;
   *   exactly 36 is NOT stale).
   */
  function classifyPypiDependency(input) {
    if (!input || typeof input !== 'object') {
      return { name: '', status: 'unknown', stale: false };
    }
    var name = input.name || '';
    var monthsAgo = typeof input.latestReleaseMonthsAgo === 'number'
      ? input.latestReleaseMonthsAgo : null;
    var stale = monthsAgo !== null && monthsAgo > 36;

    var vMin = parseVersionParts(input.declaredMin);
    var vLatest = parseVersionParts(input.latestVersion);

    if (!vMin || !vLatest) {
      return { name: name, status: 'unknown', stale: stale };
    }

    var cmp = compareVersionStrings(input.declaredMin, input.latestVersion);
    if (cmp === null) {
      return { name: name, status: 'unknown', stale: stale };
    }
    var status = cmp < 0 ? 'outdated' : 'current';
    return { name: name, status: status, stale: stale };
  }

  // -----------------------------------------------------------------------
  // Task 4: summarisePypiDependencies
  // -----------------------------------------------------------------------

  /**
   * Summarise an array of classified dependency results into the Python
   * Autopsy report figure.
   *
   * @param {Array<{ name: string, status: 'current'|'outdated'|'unknown',
   *                 stale: boolean }>} classified
   * @returns {{ total: number, known: number, outdated: number,
   *             stale: number, outdatedPct: number, stalePct: number,
   *             health: number|null }}
   *
   * health = clamp(round(100 − 0.7 × outdatedPct − 0.3 × stalePct))
   *   outdatedPct = outdated / known-status deps  (0 when known = 0)
   *   stalePct    = stale / total deps             (0 when total = 0)
   * health is null when there are no dependencies at all.
   */
  function summarisePypiDependencies(classified) {
    var list = Array.isArray(classified) ? classified : [];
    var total = list.length;
    if (total === 0) {
      return {
        total: 0, known: 0, outdated: 0, stale: 0,
        outdatedPct: 0, stalePct: 0, health: null
      };
    }
    var known = 0;
    var outdated = 0;
    var stale = 0;
    list.forEach(function (d) {
      if (!d || typeof d !== 'object') return;
      if (d.status === 'current' || d.status === 'outdated') {
        known += 1;
        if (d.status === 'outdated') outdated += 1;
      }
      if (d.stale) stale += 1;
    });
    var outdatedPct = known > 0 ? Math.round((outdated / known) * 100) : 0;
    var stalePct = total > 0 ? Math.round((stale / total) * 100) : 0;
    var health = Math.max(0, Math.min(100, Math.round(100 - outdatedPct * 0.7 - stalePct * 0.3)));
    return {
      total: total,
      known: known,
      outdated: outdated,
      stale: stale,
      outdatedPct: outdatedPct,
      stalePct: stalePct,
      health: health
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    parseRequirementsTxt: parseRequirementsTxt,
    parsePyprojectDependencies: parsePyprojectDependencies,
    extractMinVersion: extractMinVersion,
    classifyPypiDependency: classifyPypiDependency,
    summarisePypiDependencies: summarisePypiDependencies
  };
});
