/*
 * Minimal JSON Schema validator for HygieneRoll's own schemas.
 *
 * Supports the keywords those schemas use: type, const, enum, required, properties,
 * additionalProperties (false), items, minItems, maxItems, minimum, maximum,
 * exclusiveMinimum, minLength, and pattern. An unsupported keyword is an error rather
 * than being ignored, so a schema cannot silently ask for a check this file skips.
 */
"use strict";

var SUPPORTED = {
  $schema: true, $id: true, title: true, description: true,
  type: true, const: true, enum: true, required: true, properties: true,
  additionalProperties: true, items: true, minItems: true, maxItems: true,
  minimum: true, maximum: true, exclusiveMinimum: true, minLength: true, pattern: true
};

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function matchesType(value, type) {
  var actual = typeOf(value);
  return actual === type || (type === "number" && actual === "integer");
}

function validate(schema, value, path, errors) {
  path = path || "$";
  errors = errors || [];
  Object.keys(schema).forEach(function (key) {
    if (!SUPPORTED[key]) throw new Error("unsupported schema keyword " + key + " at " + path);
  });
  if (schema.type !== undefined) {
    var types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(function (type) { return matchesType(value, type); })) {
      errors.push(path + ": expected " + types.join("|") + ", got " + typeOf(value));
      return errors;
    }
  }
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(path + ": must equal " + JSON.stringify(schema.const));
  }
  if (schema.enum && !schema.enum.some(function (option) { return JSON.stringify(option) === JSON.stringify(value); })) {
    errors.push(path + ": must be one of " + JSON.stringify(schema.enum));
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(path + ": below minimum " + schema.minimum);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(path + ": above maximum " + schema.maximum);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(path + ": must exceed " + schema.exclusiveMinimum);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(path + ": shorter than " + schema.minLength);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) errors.push(path + ": does not match " + schema.pattern);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(path + ": fewer than " + schema.minItems + " items");
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(path + ": more than " + schema.maxItems + " items");
    if (schema.items) value.forEach(function (item, index) { validate(schema.items, item, path + "[" + index + "]", errors); });
  }
  if (typeOf(value) === "object") {
    (schema.required || []).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(path + ": missing " + key);
    });
    var properties = schema.properties || {};
    Object.keys(value).forEach(function (key) {
      if (properties[key]) {
        validate(properties[key], value[key], path + "." + key, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(path + ": unexpected property " + key);
      }
    });
  }
  return errors;
}

module.exports = { validate: function (schema, value) { return validate(schema, value, "$", []); } };
