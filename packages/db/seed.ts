import { db } from './index';

async function seed() {
  console.log('Seeding database...');

  // Create categories
  const categories = await Promise.all([
    db.category.upsert({
      where: { name: 'History' },
      update: {},
      create: { name: 'History', description: 'Historical events and figures' },
    }),
    db.category.upsert({
      where: { name: 'Science' },
      update: {},
      create: { name: 'Science', description: 'Scientific discoveries and concepts' },
    }),
    db.category.upsert({
      where: { name: 'Geography' },
      update: {},
      create: { name: 'Geography', description: 'Places around the world' },
    }),
    db.category.upsert({
      where: { name: 'Literature' },
      update: {},
      create: { name: 'Literature', description: 'Books and authors' },
    }),
    db.category.upsert({
      where: { name: 'Pop Culture' },
      update: {},
      create: { name: 'Pop Culture', description: 'Movies, music, and entertainment' },
    }),
    db.category.upsert({
      where: { name: 'Sports' },
      update: {},
      create: { name: 'Sports', description: 'Athletic competitions and players' },
    }),
  ]);

  console.log(`Created ${categories.length} categories`);

  // Create a question set
  const questionSet = await db.questionSet.create({
    data: {
      title: 'General Knowledge Pack 1',
      description: 'A mix of trivia across various topics',
      airDate: new Date(),
      config: { easy: 2, medium: 2, hard: 1 },
    },
  });

  console.log(`Created question set: ${questionSet.title}`);

  // Link categories to question set
  await Promise.all(
    categories.map((cat, index) =>
      db.questionSetCategory.create({
        data: {
          questionSetId: questionSet.id,
          categoryId: cat.id,
          order: index,
        },
      })
    )
  );

  // Sample questions for each category
  const questionData = [
    // History (5 questions)
    { clue: 'This ship sank on its maiden voyage in 1912', answer: 'Titanic', difficulty: 'easy' },
    { clue: 'He was the first President of the United States', answer: 'George Washington', difficulty: 'easy' },
    { clue: 'This wall divided Berlin from 1961 to 1989', answer: 'Berlin Wall', difficulty: 'medium' },
    { clue: 'The ancient city of Machu Picchu is located in this country', answer: 'Peru', difficulty: 'medium' },
    { clue: 'This French emperor was exiled to the island of Elba', answer: 'Napoleon', difficulty: 'hard' },

    // Science (5 questions)
    { clue: 'This planet is known as the Red Planet', answer: 'Mars', difficulty: 'easy' },
    { clue: 'H2O is the chemical formula for this substance', answer: 'Water', difficulty: 'easy' },
    { clue: 'This scientist developed the theory of relativity', answer: 'Einstein', difficulty: 'medium' },
    { clue: 'The powerhouse of the cell', answer: 'Mitochondria', difficulty: 'medium' },
    { clue: 'This element has the atomic number 79', answer: 'Gold', difficulty: 'hard' },

    // Geography (5 questions)
    { clue: 'This is the largest country by land area', answer: 'Russia', difficulty: 'easy' },
    { clue: 'The capital of Japan', answer: 'Tokyo', difficulty: 'easy' },
    { clue: 'This river is the longest in Africa', answer: 'Nile', difficulty: 'medium' },
    { clue: 'The smallest country in the world', answer: 'Vatican City', difficulty: 'medium' },
    { clue: 'This mountain range separates Europe from Asia', answer: 'Ural Mountains', difficulty: 'hard' },

    // Literature (5 questions)
    { clue: 'He wrote Romeo and Juliet', answer: 'Shakespeare', difficulty: 'easy' },
    { clue: 'The boy wizard created by J.K. Rowling', answer: 'Harry Potter', difficulty: 'easy' },
    { clue: 'This novel begins with "Call me Ishmael"', answer: 'Moby Dick', difficulty: 'medium' },
    { clue: 'Author of 1984 and Animal Farm', answer: 'George Orwell', difficulty: 'medium' },
    { clue: 'The Catcher in the Rye was written by this author', answer: 'J.D. Salinger', difficulty: 'hard' },

    // Pop Culture (5 questions)
    { clue: 'This superhero is known as the Dark Knight', answer: 'Batman', difficulty: 'easy' },
    { clue: 'The band that performed "Bohemian Rhapsody"', answer: 'Queen', difficulty: 'easy' },
    { clue: 'This movie features a shark terrorizing a beach town', answer: 'Jaws', difficulty: 'medium' },
    { clue: 'He played Jack in Titanic', answer: 'Leonardo DiCaprio', difficulty: 'medium' },
    { clue: 'This TV show features dragons and a battle for the Iron Throne', answer: 'Game of Thrones', difficulty: 'hard' },

    // Sports (5 questions)
    { clue: 'This sport uses a puck', answer: 'Hockey', difficulty: 'easy' },
    { clue: 'The number of players on a basketball team on the court', answer: 'Five', difficulty: 'easy' },
    { clue: 'He has won the most Olympic gold medals', answer: 'Michael Phelps', difficulty: 'medium' },
    { clue: 'The country that has won the most FIFA World Cups', answer: 'Brazil', difficulty: 'medium' },
    { clue: 'This tennis tournament is played on grass courts', answer: 'Wimbledon', difficulty: 'hard' },
  ];

  // Create questions
  const questions = await Promise.all(
    questionData.map((q) =>
      db.question.create({
        data: {
          clue: q.clue,
          answer: q.answer,
          difficulty: q.difficulty,
          questionSetId: questionSet.id,
        },
      })
    )
  );

  console.log(`Created ${questions.length} questions`);

  console.log('Seed complete!');
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
