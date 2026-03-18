export function normalizeNoteInput(input: { title: string }): {
  title: string;
} {
  const title = input.title.trim();

  return {
    title: title.length > 0 ? title : "Untitled note",
  };
}
