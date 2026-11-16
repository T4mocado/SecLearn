-- The "Ôn tập" review-quiz feature was removed from the app; drop its tables and enums.
DROP TABLE IF EXISTS "QuizAttempt";
DROP TABLE IF EXISTS "Question";
DROP TABLE IF EXISTS "Quiz";
DROP TYPE IF EXISTS "AttemptMode";
DROP TYPE IF EXISTS "QuizSource";
