export function generateRoomCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

export function validateAnswer(userAnswer: string, correctAnswer: string): boolean {
  // Simple fuzzy matching - can be improved with fuse.js later
  const normalize = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  };

  const normalizedUser = normalize(userAnswer);
  const normalizedCorrect = normalize(correctAnswer);

  // Exact match
  if (normalizedUser === normalizedCorrect) {
    return true;
  }

  // Check if user answer contains the correct answer (for partial matches)
  if (normalizedUser.includes(normalizedCorrect) || normalizedCorrect.includes(normalizedUser)) {
    return true;
  }

  return normalizedUser === normalizedCorrect;
}