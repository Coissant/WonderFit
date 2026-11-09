/* ==========================================================================
   Daily Motivational Quotes Database
   Curated fitness, discipline, athletic, and mindset quotes.
   ========================================================================== */

export const MOTIVATIONAL_QUOTES = [
  { text: "We don't rise to the level of our expectations, we fall to the level of our training.", author: "Archilochus" },
  { text: "The body achieves what the mind believes.", author: "Napoleon Hill" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "You don't have to be extreme, just consistent.", author: "Anonymous" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "The pain of discipline is nothing like the pain of disappointment.", author: "Justin Langer" },
  { text: "It never gets easier, you just get better.", author: "Greg LeMond" },
  { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  { text: "The only bad workout is the one that didn't happen.", author: "Anonymous" },
  { text: "Strength does not come from physical capacity. It comes from an indomitable will.", author: "Mahatma Gandhi" },
  { text: "Today I will do what others won't, so tomorrow I can accomplish what others can't.", author: "Jerry Rice" },
  { text: "Success starts with self-discipline.", author: "Dwayne Johnson" },
  { text: "What hurts today makes you stronger tomorrow.", author: "Jay Cutler" },
  { text: "No citizen has a right to be an amateur in the matter of physical training. What a disgrace it is to grow old without seeing the beauty and strength of which his body is capable.", author: "Socrates" },
  { text: "The clock is ticking. Are you becoming the person you want to be?", author: "Greg Plitt" },
  { text: "If you want something you've never had, you must be willing to do something you've never done.", author: "Thomas Jefferson" },
  { text: "Energy flows where attention goes.", author: "Tony Robbins" },
  { text: "Once you learn to quit, it becomes a habit.", author: "Vince Lombardi" },
  { text: "You must expect great things of yourself before you can do them.", author: "Michael Jordan" },
  { text: "The resistance that you fight physically in the gym and the resistance that you fight in life can only build a strong character.", author: "Arnold Schwarzenegger" },
  { text: "Continuous effort — not strength or intelligence — is the key to unlocking our potential.", author: "Winston Churchill" },
  { text: "Hard days are best because that's when champions are made.", author: "Gabby Douglas" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "A champion is someone who gets up when they can't.", author: "Jack Dempsey" },
  { text: "Success isn't always about greatness. It's about consistency. Consistent hard work leads to success.", author: "Dwayne Johnson" },
  { text: "Rome wasn't built in a day, but they worked on it every single day.", author: "Anonymous" },
  { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { text: "Focus on the process, not the outcome.", author: "Nick Saban" },
  { text: "It's not about having time, it's about making time.", author: "Anonymous" },
  { text: "Whether you think you can, or you think you can't — you're right.", author: "Henry Ford" },
  { text: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche" },
  { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun" },
  { text: "First say to yourself what you would be; and then do what you have to do.", author: "Epictetus" },
  { text: "Mastery demands consistency.", author: "Anonymous" },
  { text: "The only person you should try to be better than is the person you were yesterday.", author: "Mat Fraser" },
  { text: "Suffer the pain of discipline or suffer the pain of regret.", author: "Jim Rohn" },
  { text: "Great things are done by a series of small things brought together.", author: "Vincent van Gogh" },
  { text: "Clear your mind of can't.", author: "Samuel Johnson" },
  { text: "There are no shortcuts to any place worth going.", author: "Beverly Sills" },
  { text: "The mind is the limit. As long as the mind can envision the fact that you can do something, you can do it.", author: "Arnold Schwarzenegger" },
  { text: "You are what you repeatedly do. Excellence, then, is not an act, but a habit.", author: "Will Durant" },
  { text: "Don't wish it were easier, wish you were better.", author: "Jim Rohn" },
  { text: "A year from now you may wish you had started today.", author: "Karen Lamb" },
  { text: "The iron never lies to you. Two hundred pounds is always two hundred pounds.", author: "Henry Rollins" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "Strength is the outcome of struggle.", author: "Rich Froning" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Tough times don't last, tough people do.", author: "Robert H. Schuller" },
  { text: "Do something today that your future self will thank you for.", author: "Sean Patrick Flanery" },
  { text: "Your body can stand almost anything. It's your mind that you have to convince.", author: "Anonymous" },
];

/**
 * Returns a stable daily quote based on the current calendar date.
 * Passing an offset allows cycling through quotes on demand.
 */
export function getDailyQuote(offset = 0) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const dayKey = y * 10000 + m * 100 + d;
  // Scramble dayKey so adjacent days don't just step sequential indices
  const seed = (dayKey * 9301 + 49297) % 233280;
  const baseIndex = seed % MOTIVATIONAL_QUOTES.length;
  const index = (baseIndex + (offset % MOTIVATIONAL_QUOTES.length) + MOTIVATIONAL_QUOTES.length) % MOTIVATIONAL_QUOTES.length;
  return {
    ...MOTIVATIONAL_QUOTES[index],
    index,
    total: MOTIVATIONAL_QUOTES.length,
  };
}
