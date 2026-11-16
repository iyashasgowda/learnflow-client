import { Link } from 'react-router-dom';
import { LegalPage } from '../components/LegalPage';
import { LEGAL_PATHS } from '../constants';

export function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>By creating an account or using LearnFlow you agree to these terms. If you do not agree, please do not use the service.</p>

      <h2>The service</h2>
      <p>LearnFlow helps you plan your studying: tasks, study sessions, uploaded materials, an AI assistant, summaries and quizzes. Features may change, and the service may be unavailable from time to time.</p>

      <h2>Your account</h2>
      <ul>
        <li>Give a real email address that you control, and keep your password private.</li>
        <li>You are responsible for what happens under your account.</li>
        <li>You can delete your account at any time in Settings. Deleting it removes your data as described in the <Link to={LEGAL_PATHS.privacy}>Privacy Policy</Link>.</li>
      </ul>

      <h2>Your content</h2>
      <p>You keep the rights to what you upload and write. You give LearnFlow permission to store and process it, including sending text to an AI provider, only to run the features you use. Upload only material you are allowed to use.</p>

      <h2>AI features</h2>
      <ul>
        <li>Answers, summaries and quizzes are written by an AI and can be wrong or incomplete. Check important facts against your course material.</li>
        <li>Quiz scores are calculated by LearnFlow, not by the AI. An AI review of a short answer is a second opinion and does not change your score.</li>
        <li>Chat messages and document text are sent to a third-party AI provider, as the Privacy Policy explains.</li>
        <li>There are daily limits on AI use to keep the service available to everyone.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not attack, overload or probe the service, try to reach other people&rsquo;s data, upload unlawful or harmful content, or use the service to harass anyone. Accounts that do may be limited or closed.</p>

      <h2>No guarantee</h2>
      <p>The service is provided as it is. To the extent the law allows, the operator is not liable for lost data, missed deadlines or exam results. Keep your own copy of anything important.</p>

      <h2>Changes</h2>
      <p>These terms may change. When they do, the page is updated, and continuing to use the service means you accept the new version.</p>
    </LegalPage>
  );
}
