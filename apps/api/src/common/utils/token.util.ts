// Format des jetons opaques : "<recordId>.<secretAléatoire>".
// On stocke uniquement le hash argon2 du secret ; la recherche se fait par recordId.
export interface SplitToken {
  id: string;
  secret: string;
}

export function splitToken(value: string): SplitToken | null {
  const idx = value.indexOf('.');
  if (idx <= 0 || idx >= value.length - 1) {
    return null;
  }
  return { id: value.slice(0, idx), secret: value.slice(idx + 1) };
}
