// Joins class names, skipping empty ones: cx(s.card, picked && s.picked, className).
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
