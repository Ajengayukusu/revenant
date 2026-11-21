/*
 * REVENANT — deps.js
 * Pure logic for the dependency autopsy: semver-ish version parsing and
 * comparison, outdated classification, package.json extraction, and the
 * dependency health summary. No DOM, no fetch — all network access lives
 * in app.js, which feeds registry responses in here as plain data.
 *
 * Browser-global: window.RevenantDeps. Node: require()-able (UMD guard,
 * same pattern as score.js).
 *
 * Dependency health (0–100, higher = healthier) — a REPORT FIGURE ONLY.
 * It does NOT feed the Resurrection Score in score.js; the score formula
 * there is a documented promise and is unchanged by this module.
 *
 *   health = clamp(round(100 − 0.7 × outdatedPct − 0.3 × deprecatedPct))
 *     outdatedPct   = outdated deps / deps with a known registry status
 *     deprecatedPct = deprecated deps / all deps
 *   health is null when there are no dependencies at all.
 *
 * Invariant (property-tested): marking a dependency deprecated never
 * raises the health of the same dependency set.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RevenantDeps = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Parse the first plain semver (x.y.z, x.y, or x) out of a version or
   * range string ("^1.2.3", "~2.0", ">=3.1.4 <4"). Returns
   * { major, minor, patch } with missing parts as 0, or null when the
   * string carries no registry version (e.g. "*", "latest", a git URL,
   * a file: path, an npm: alias).
   */
  function parseVersion(text) {
    if (typeof text !== 'string') return null;
    var trimmed = text.trim();
    if (!trimmed) return null;
    if (/^(file:|link:|git\+|https?:|npm:)/i.test(trimmed)) return null;
    var match = trimmed.match(/(\d+)\.(\d+)\.(\d+)/) ||
      trimmed.match(/(\d+)\.(\d+)(?![\d.])/) ||
      trimmed.match(/^[^0-9]*(\d+)$/);
    if (!match) return null;
    return {
      major: Number(match[1]),
      minor: match[2] != null ? Number(match[2]) : 0,
      patch: match[3] != null ? Number(match[3]) : 0
    };
  }

  /** Compare two parsed versions (or raw strings). Returns -1, 0, or 1; null if either is unparseable. */
  function compareVersions(a, b) {
    var va = (a && typeof a === 'object') ? a : parseVersion(a);
    var vb = (b && typeof b === 'object') ? b : parseVersion(b);
    if (!va || !vb) return null;
    if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
    if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
    if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;
    return 0;
  }

  /**
   * Classify one dependency against the latest registry version.
   * @param {string} installedRange  the range from package.json ("^1.2.3")
   * @param {string} latestVersion   the registry's latest version ("2.0.1")
   * @returns {'current'|'minor-behind'|'major-behind'|'unknown'}
   *   'unknown' when either side cannot be parsed (workspace refs, git
   *   deps, missing registry data). An installed version ahead of the
   *   registry latest counts as 'current'.
   */
  function classifyOutdated(installedRange, latestVersion) {
    var installed = parseVersion(installedRange);
    var latest = parseVersion(latestVersion);
    if (!installed || !latest) return 'unknown';
    var cmp = compareVersions(installed, latest);
    if (cmp === null || cmp >= 0) return cmp === null ? 'unknown' : 'current';
    if (installed.major < latest.major) return 'major-behind';
    return 'minor-behind';
  }

  /** True when a registry `deprecated` field marks the package deprecated. */
  function isDeprecated(deprecatedField) {
    return typeof deprecatedField === 'string' && deprecatedField.trim().length > 0;
  }

  /**
   * Extract a flat dependency list from a parsed package.json object.
   * @returns {Array<{name: string, range: string, dev: boolean}>}
   */
  function extractDependencies(pkg) {
    var out = [];
    if (!pkg || typeof pkg !== 'object') return out;
    function collect(map, dev) {
      if (!map || typeof map !== 'object') return;
      Object.keys(map).forEach(function (name) {
        out.push({ name: name, range: String(map[name]), dev: dev });
      });
    }
    collect(pkg.dependencies, false);
    collect(pkg.devDependencies, true);
    return out;
  }

  /**
   * Parse package.json text and extract its dependencies.
   * Returns null when the text is not valid JSON / not an object.
   */
  function parsePackageJson(text) {
    if (typeof text !== 'string') return null;
    var pkg;
    try { pkg = JSON.parse(text); } catch (e) { return null; }
    if (!pkg || typeof pkg !== 'object') return null;
    return extractDependencies(pkg);
  }

  /**
   * Summarise per-dependency registry results into the Autopsy report.
   * @param {Array<{name: string, range?: string, latest?: string|null,
   *   deprecated?: string|boolean|null, status?: string}>} details
   *   `status` may be precomputed with classifyOutdated; when absent it is
   *   derived from range + latest here.
   * @returns {{total: number, checked: number, outdated: number,
   *   outdatedPct: number, deprecated: Array, deprecatedCount: number,
   *   deprecatedPct: number, majorBehind: number, minorBehind: number,
   *   health: number|null}}
   */
  function summariseDependencies(details) {
    var list = Array.isArray(details) ? details : [];
    var deprecated = [];
    var checked = 0;
    var outdated = 0;
    var majorBehind = 0;
    var minorBehind = 0;

    list.forEach(function (d) {
      if (!d || typeof d !== 'object') return;
      var dep = (d.deprecated === true) || isDeprecated(d.deprecated);
      if (dep) deprecated.push(d.name != null ? String(d.name) : '(unnamed)');
      var status = d.status || classifyOutdated(d.range, d.latest);
      if (status && status !== 'unknown') {
        checked += 1;
        if (status === 'major-behind') { outdated += 1; majorBehind += 1; }
        if (status === 'minor-behind') { outdated += 1; minorBehind += 1; }
      }
    });

    var total = list.length;
    var outdatedPct = checked > 0 ? Math.round((outdated / checked) * 100) : 0;
    var deprecatedPct = total > 0 ? Math.round((deprecated.length / total) * 100) : 0;
    var health = null;
    if (total > 0) {
      health = Math.max(0, Math.min(100, Math.round(100 - outdatedPct * 0.7 - deprecatedPct * 0.3)));
    }

    return {
      total: total,
      checked: checked,
      outdated: outdated,
      outdatedPct: outdatedPct,
      deprecated: deprecated,
      deprecatedCount: deprecated.length,
      deprecatedPct: deprecatedPct,
      majorBehind: majorBehind,
      minorBehind: minorBehind,
      health: health
    };
  }

  return {
    parseVersion: parseVersion,
    compareVersions: compareVersions,
    classifyOutdated: classifyOutdated,
    isDeprecated: isDeprecated,
    extractDependencies: extractDependencies,
    parsePackageJson: parsePackageJson,
    summariseDependencies: summariseDependencies
  };
});
