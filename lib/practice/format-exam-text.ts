/** Restore spacing lost when printed IELTS passages were imported as plain text. */
export function formatExamText(value: string): string {
  return value
    .replace(/([,;:!?])(?=[A-Za-z])/gu, "$1 ")
    .replace(/([A-Za-z*])\.([A-Z][a-z])/gu, "$1. $2")
    .replace(/(s')(?=[A-Za-z])/gu, "$1 ")
    .replace(/\*(?=[A-Za-z])/gu, "* ");
}
