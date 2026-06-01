import React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import RunningInterviews from './RunningInterviews';
import InterviewsCompleted from './InterviewsCompleted';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatViewLocationState {
  interviewsDone?: boolean;
}

interface ChatViewParams {
  objectiveId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
//
// ChatView is now a state router:
//
//   • Default (no state)         → RunningInterviews (automated loader + background API calls)
//   • { interviewsDone: true }   → InterviewsCompleted ("From Interviews to Insights" card)
//
// The old manual-chat UI has been moved to ConversationStudio (a modal on the
// InsightGeneration page), which is accessible once interviews are complete.

const ChatView: React.FC = () => {
  const location = useLocation();
  const { objectiveId } = useParams<{ objectiveId?: string }>();
  const state = location.state as ChatViewLocationState | null;

  // Check localStorage so that resuming via "Continue" (no location.state) also
  // skips re-running interviews when they were already completed.
  const interviewsDoneInStorage = objectiveId
    ? !!localStorage.getItem(`qualitative_sub2_${objectiveId}`)
    : false;

  if (state?.interviewsDone || interviewsDoneInStorage) {
    return <InterviewsCompleted />;
  }

  return <RunningInterviews />;
};

export default ChatView;