export type EditableField = { name: string; type: string; required: boolean; nullable: boolean };
const arrayFields = ["stack", "tags", "features", "deliverables"];
export function inputValue(field: EditableField, value: any): string | boolean {
  if (field.type === "boolean") return value === true;
  if (value == null) return "";
  if (arrayFields.includes(field.name))
    return Array.isArray(value) ? value.join("\n") : String(value);
  if (field.name.endsWith("_cents")) return String(Number(value) / 100);
  if (field.name.endsWith("_at")) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  if (field.type === "json") return JSON.stringify(value, null, 2);
  return String(value);
}
export function fieldValue(field: EditableField, value: string | boolean, isNew: boolean): any {
  if (field.type === "boolean") return value === true;
  const text = String(value).trim();
  if (!text) {
    if (field.required) throw new Error(`${field.name.replaceAll("_", " ")} is required.`);
    if (isNew) return undefined;
    if (field.nullable) return null;
    if (arrayFields.includes(field.name)) return [];
    if (field.type === "number")
      throw new Error(`${field.name.replaceAll("_", " ")} needs a number.`);
    if (field.type === "json") return {};
    return "";
  }
  if (arrayFields.includes(field.name))
    return text
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
  if (field.type === "json") {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Social links must be a valid JSON object.");
    }
  }
  if (field.type === "number") {
    const n = Number(text);
    if (!Number.isFinite(n)) throw new Error(`${field.name} must be a number.`);
    if (field.name.endsWith("_cents")) {
      if (n < 0) throw new Error("Price cannot be negative.");
      return Math.round(n * 100);
    }
    if (field.name !== "rating" && !Number.isSafeInteger(n))
      throw new Error(`${field.name.replaceAll("_", " ")} must be a whole number.`);
    if (field.name.includes("discount_percent") && (n < 0 || n > 100))
      throw new Error("Discount must be between 0 and 100.");
    if (field.name === "rating" && (n < 1 || n > 5))
      throw new Error("Rating must be between 1 and 5.");
    return n;
  }
  if (field.name.endsWith("_at")) {
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new Error("Enter a valid date.");
    return date.toISOString();
  }
  return text;
}
export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
/** Search text is quoted as a PostgREST literal, not interpolated as filters. */
export function searchFilter(columns: string[], query: string) {
  const literal = query
    .trim()
    .replace(/[\\%_]/g, (c) => "\\" + c)
    .replaceAll('"', '\\"');
  return columns.map((column) => `${column}.ilike."%${literal}%"`).join(",");
}
