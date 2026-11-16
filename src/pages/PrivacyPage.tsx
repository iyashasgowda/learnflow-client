import { Link } from 'react-router-dom';
import { LegalPage } from '../components/LegalPage';
import { LEGAL_PATHS } from '../constants';

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>This policy explains what LearnFlow stores about you, who receives it, and how you can have it removed.</p>

      <h2>What we store</h2>
      <ul>
        <li>Your account: email address, a salted hash of your password (never the password itself), whether the address is verified, and when you accepted the Terms and this policy.</li>
        <li>Your study data: tasks, planned study sessions, quizzes and your attempts and answers, summaries, chat conversations and their messages, and your settings (theme, time zone, first day of the week).</li>
        <li>The text of the materials you upload, split into parts so it can be summarized and used for quizzes.</li>
        <li>One sign-in cookie that keeps you signed in. It is not readable by scripts on the page and is only sent to LearnFlow.</li>
        <li>Short-lived technical records: server logs hold the time, request path, status and a request id. They do not hold passwords, message text, document text, email addresses or query strings.</li>
      </ul>

      <h2 id="ai-provider">Text sent to the AI provider</h2>
      <p>
        <strong>
          Chat messages and document text are sent to a third-party AI provider (currently OpenAI) so that it can write answers, summaries and quizzes.
        </strong>{' '}
        This covers the messages you send to the assistant (with the earlier messages of the same conversation), the text of a document when you ask for a summary or a quiz about it, and your short answers when you ask the AI to review them.
      </p>
      <p>
        Do not send anything you are not comfortable sharing with that provider. The provider handles that text under its own terms and privacy policy. LearnFlow does not send your email address or password to it. If you never use the AI features, nothing is sent.
      </p>

      <h2>What is kept and what is discarded</h2>
      <ul>
        <li>
          <strong>Uploaded files are not kept.</strong> Only the extracted text is stored. The original file is discarded as soon as it has been read, whether or not reading succeeded.
        </li>
        <li>Extracted text, summaries, conversations, quizzes and the rest of your study data stay until you delete them or delete your account.</li>
        <li>Sign-in sessions expire on their own and are removed after they expire.</li>
      </ul>

      <h2>Deleting your data</h2>
      <p>
        You can delete a material, a conversation, a task or a planned session at any time. To remove everything, open <Link to="/settings">Settings</Link> and choose Delete account. You confirm with your password, and your account and all the data listed above are removed at once. Backups made before the deletion expire on the schedule set by the operator of this installation.
      </p>

      <h2>Sharing</h2>
      <p>Your data is not sold. It is shared only with the AI provider as described above, and with the hosting and email services needed to run LearnFlow (for example to send you the verification and password reset emails).</p>

      <h2>Questions</h2>
      <p>
        Contact the operator of this installation. See also the <Link to={LEGAL_PATHS.terms}>Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}
