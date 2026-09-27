(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.HygieneRollEvidenceGovernance = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Evidence Governance v0.2.
  //
  // Two separate gates stand between a source and a public external claim:
  //
  //   SOURCE -> source qualification -> ADMITTED SOURCE
  //          -> claim-source qualification -> ADMISSIBLE CLAIM -> PUBLICATION
  //
  // An admitted source is trustworthy in general. It is not evidence for every
  // claim. Every gate fails closed: absence of qualification is not permission.

  var GOVERNANCE_VERSION = "0.2";

  var CLAIM_CLASSES = [
    "PROJECT_DEFINITION",
    "OBSERVED_EVIDENCE",
    "DERIVED_INTERPRETATION",
    "ILLUSTRATIVE_MODEL"
  ];

  var EXTERNAL_CLASSES = ["OBSERVED_EVIDENCE", "DERIVED_INTERPRETATION"];

  var ADMISSION_STATUSES = ["ADMITTED", "REVIEW_REQUIRED", "BLOCKED"];

  var REQUIRED_SOURCE_FIELDS = [
    "id",
    "title",
    "publisher",
    "url",
    "source_type",
    "publication_date",
    "accessed_date",
    "geography",
    "population",
    "scope",
    "metric",
    "rights_note",
    "admission_status",
    "notes"
  ];

  var QUALIFICATION_DIMENSIONS = [
    "scope_match",
    "period_match",
    "geography_match",
    "population_match",
    "metric_match",
    "wording_supported"
  ];

  var RESULTS = { ADMISSIBLE: "ADMISSIBLE", BLOCKED: "BLOCKED" };

  var LEGACY_STATUSES = ["PENDING_MIGRATION", "MIGRATED", "SUPPRESSED"];

  var SOURCE_ID_PATTERN = /^SRC-HR-\d{4}$/;
  var FULL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  var PARTIAL_DATE_PATTERN = /^\d{4}(-\d{2}(-\d{2})?)?$/;

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isRealDate(value, pattern) {
    if (!pattern.test(value)) return false;
    var parts = value.split("-").map(Number);
    var year = parts[0];
    var month = parts.length > 1 ? parts[1] : 1;
    var day = parts.length > 2 ? parts[2] : 1;
    var date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
  }

  // Source gate. A record may be ADMITTED only when every required field is
  // present and well formed. Declaring ADMITTED on an incomplete record does
  // not admit it.
  function validateSource(source) {
    var errors = [];
    if (!isPlainObject(source)) {
      return { valid: false, errors: ["source-not-object"] };
    }
    REQUIRED_SOURCE_FIELDS.forEach(function (field) {
      if (!isNonEmptyString(source[field])) {
        errors.push("missing-field:" + field);
      }
    });
    if (isNonEmptyString(source.id) && !SOURCE_ID_PATTERN.test(source.id)) {
      errors.push("invalid-id");
    }
    if (isNonEmptyString(source.url) && !/^https?:\/\/\S+$/.test(source.url)) {
      errors.push("invalid-url");
    }
    if (isNonEmptyString(source.publication_date) &&
        !isRealDate(source.publication_date, PARTIAL_DATE_PATTERN)) {
      errors.push("invalid-publication-date");
    }
    if (isNonEmptyString(source.accessed_date) &&
        !isRealDate(source.accessed_date, FULL_DATE_PATTERN)) {
      errors.push("invalid-accessed-date");
    }
    if (errors.indexOf("invalid-publication-date") === -1 &&
        errors.indexOf("invalid-accessed-date") === -1 &&
        isNonEmptyString(source.publication_date) &&
        isNonEmptyString(source.accessed_date) &&
        source.accessed_date < source.publication_date) {
      errors.push("accessed-before-publication");
    }
    if (isNonEmptyString(source.admission_status) &&
        ADMISSION_STATUSES.indexOf(source.admission_status) === -1) {
      errors.push("invalid-admission-status");
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function sourceAdmission(source) {
    var validation = validateSource(source);
    if (!validation.valid) {
      return { status: "BLOCKED", errors: validation.errors };
    }
    return { status: source.admission_status, errors: [] };
  }

  function isAdmittedSource(source) {
    return sourceAdmission(source).status === "ADMITTED";
  }

  // Claim-source gate. The result is computed from the dimensions. A declared
  // result is never trusted, and anything other than a literal true fails.
  function evaluateQualification(record, claimId, sourceId) {
    var errors = [];
    if (!isPlainObject(record)) {
      return { result: RESULTS.BLOCKED, errors: ["missing-qualification"] };
    }
    if (!isNonEmptyString(record.claim_id)) errors.push("missing-claim-id");
    if (!isNonEmptyString(record.source_id)) errors.push("missing-source-id");
    if (claimId !== undefined && record.claim_id !== claimId) {
      errors.push("claim-mismatch");
    }
    if (sourceId !== undefined && record.source_id !== sourceId) {
      errors.push("source-mismatch");
    }
    var dimensions = record.qualification;
    if (!isPlainObject(dimensions)) {
      errors.push("missing-qualification-dimensions");
    } else {
      QUALIFICATION_DIMENSIONS.forEach(function (dimension) {
        if (!Object.prototype.hasOwnProperty.call(dimensions, dimension)) {
          errors.push("missing-dimension:" + dimension);
        } else if (dimensions[dimension] !== true) {
          errors.push("failed-dimension:" + dimension);
        }
      });
      Object.keys(dimensions).forEach(function (key) {
        if (QUALIFICATION_DIMENSIONS.indexOf(key) === -1) {
          errors.push("unknown-dimension:" + key);
        }
      });
    }
    var result = errors.length === 0 ? RESULTS.ADMISSIBLE : RESULTS.BLOCKED;
    if (record.result !== undefined && record.result !== result) {
      errors.push("declared-result-contradicted:" + record.result);
      result = RESULTS.BLOCKED;
    }
    return { result: result, errors: errors };
  }

  function indexSources(sources) {
    var index = {};
    (sources || []).forEach(function (source) {
      if (isPlainObject(source) && isNonEmptyString(source.id)) {
        index[source.id] = index[source.id] ? null : source;
      }
    });
    return index;
  }

  function findQualifications(qualifications, claimId, sourceId) {
    return (qualifications || []).filter(function (record) {
      return isPlainObject(record) &&
        record.claim_id === claimId &&
        record.source_id === sourceId;
    });
  }

  // Claim gate. For an external claim, every cited source must be resolvable,
  // complete, ADMITTED, and qualified for this exact claim.
  // context: { sources: [source], qualifications: [record] }
  function evaluateClaim(claim, context) {
    var errors = [];
    var ctx = context || {};
    if (!isPlainObject(claim)) {
      return { result: RESULTS.BLOCKED, errors: ["claim-not-object"] };
    }
    if (CLAIM_CLASSES.indexOf(claim.class) === -1) {
      return { result: RESULTS.BLOCKED, errors: ["invalid-class"] };
    }
    var ids = Array.isArray(claim.source_ids) ? claim.source_ids : null;
    var origins = Array.isArray(claim.origin_refs) ? claim.origin_refs : [];

    if (claim.class === "PROJECT_DEFINITION") {
      if (ids === null || ids.length !== 0) errors.push("project-definition-with-source");
      if (origins.length === 0) errors.push("project-definition-without-origin");
    }

    if (EXTERNAL_CLASSES.indexOf(claim.class) !== -1) {
      if (!isNonEmptyString(claim.id)) errors.push("missing-claim-id");
      if (ids === null || ids.length === 0) {
        errors.push("external-claim-without-source");
      } else {
        if (new Set(ids).size !== ids.length) errors.push("duplicate-source-id");
        var index = indexSources(ctx.sources);
        ids.forEach(function (id) {
          var source = index[id];
          if (source === null) {
            errors.push("ambiguous-source:" + id);
            return;
          }
          if (!source) {
            errors.push("unresolved-source:" + id);
            return;
          }
          var admission = sourceAdmission(source);
          if (admission.status !== "ADMITTED") {
            errors.push("source-not-admitted:" + id);
            return;
          }
          var records = findQualifications(ctx.qualifications, claim.id, id);
          if (records.length === 0) {
            errors.push("missing-qualification:" + id);
            return;
          }
          if (records.length > 1) {
            errors.push("ambiguous-qualification:" + id);
            return;
          }
          var qualification = evaluateQualification(records[0], claim.id, id);
          if (qualification.result !== RESULTS.ADMISSIBLE) {
            qualification.errors.forEach(function (error) {
              errors.push("not-qualified:" + id + ":" + error);
            });
          }
        });
      }
    }

    return {
      result: errors.length === 0 ? RESULTS.ADMISSIBLE : RESULTS.BLOCKED,
      errors: errors
    };
  }

  function canPublish(claim, context) {
    return evaluateClaim(claim, context).result === RESULTS.ADMISSIBLE;
  }

  function compareVersions(a, b) {
    var left = String(a).split(".").map(Number);
    var right = String(b).split(".").map(Number);
    for (var i = 0; i < Math.max(left.length, right.length); i += 1) {
      var diff = (left[i] || 0) - (right[i] || 0);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    }
    return 0;
  }

  // Legacy external claims are registered, not grandfathered. A pending legacy
  // claim is never admissible. It must be migrated or suppressed by its due
  // version.
  function evaluateLegacyClaim(legacy, context) {
    var errors = [];
    if (!isPlainObject(legacy)) {
      return { admissible: false, errors: ["legacy-not-object"] };
    }
    if (LEGACY_STATUSES.indexOf(legacy.migration_status) === -1) {
      errors.push("invalid-migration-status");
    }
    if (legacy.migration_status === "PENDING_MIGRATION") {
      errors.push("pending-migration");
    }
    if (legacy.migration_status === "SUPPRESSED") {
      errors.push("suppressed");
    }
    if (legacy.migration_status === "MIGRATED") {
      var governed = (context && context.claims || []).filter(function (claim) {
        return claim && claim.id === legacy.governed_claim_id;
      });
      if (governed.length !== 1) {
        errors.push("migrated-without-governed-claim");
      } else if (!canPublish(governed[0], context)) {
        errors.push("governed-claim-blocked");
      }
    }
    return { admissible: errors.length === 0, errors: errors };
  }

  // Quantitative external-claim markers: currency figures, magnitude words, and
  // growth-rate language. Any match on a public surface must belong to a
  // registered claim.
  var EXTERNAL_FIGURE_PATTERN =
    /(?:USD|US\$|\$|€|£)\s?\d|\d[\d.,]*\s?(?:billion|trillion|million|bn)\b|\bCAGR\b/gi;

  function stripNonContent(html) {
    return String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");
  }

  function unregisteredFigures(html, registeredFragments) {
    var text = stripNonContent(html);
    (registeredFragments || []).forEach(function (fragment) {
      if (isNonEmptyString(fragment)) {
        text = text.split(fragment).join(" ");
      }
    });
    return text.match(EXTERNAL_FIGURE_PATTERN) || [];
  }

  return {
    GOVERNANCE_VERSION: GOVERNANCE_VERSION,
    CLAIM_CLASSES: CLAIM_CLASSES.slice(),
    EXTERNAL_CLASSES: EXTERNAL_CLASSES.slice(),
    ADMISSION_STATUSES: ADMISSION_STATUSES.slice(),
    REQUIRED_SOURCE_FIELDS: REQUIRED_SOURCE_FIELDS.slice(),
    QUALIFICATION_DIMENSIONS: QUALIFICATION_DIMENSIONS.slice(),
    LEGACY_STATUSES: LEGACY_STATUSES.slice(),
    RESULTS: RESULTS,
    validateSource: validateSource,
    sourceAdmission: sourceAdmission,
    isAdmittedSource: isAdmittedSource,
    evaluateQualification: evaluateQualification,
    evaluateClaim: evaluateClaim,
    canPublish: canPublish,
    evaluateLegacyClaim: evaluateLegacyClaim,
    compareVersions: compareVersions,
    unregisteredFigures: unregisteredFigures
  };
});
