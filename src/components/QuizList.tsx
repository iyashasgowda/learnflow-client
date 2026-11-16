import { Link } from 'react-router-dom';
import type { QuizSummary } from '../api/quizzes';
import { QUIZ_DIFFICULTIES } from '../constants';
import { useFormatters } from '../settings/useFormatters';

const difficultyLabel = (value: QuizSummary['difficulty']): string => QUIZ_DIFFICULTIES.find((item) => item.value === value)?.label ?? value;

const attemptsText = (count: number): string => `${count} ${count === 1 ? 'attempt' : 'attempts'}`;

export function QuizList({ items }: { items: QuizSummary[] }) {
  const { dateTime } = useFormatters();
  if (items.length === 0) return <p className="text-muted">You have no quizzes yet. Make one above.</p>;
  return (
    <ul className="material-list" aria-label="Your quizzes">
      {items.map((quiz) => (
        <li key={quiz.id} className="material">
          <div className="material-body">
            <p className="material-name">{quiz.title}</p>
            <p className="task-meta">
              <span>{difficultyLabel(quiz.difficulty)}</span>
              <span>{quiz.questionCount} questions</span>
              <span>{attemptsText(quiz.attemptCount)}</span>
              <span>{dateTime(quiz.createdAt)}</span>
            </p>
          </div>
          <Link className="button button-quiet" to={`/quiz/${quiz.id}`} aria-label={`Open: ${quiz.title}`}>
            Open
          </Link>
        </li>
      ))}
    </ul>
  );
}
