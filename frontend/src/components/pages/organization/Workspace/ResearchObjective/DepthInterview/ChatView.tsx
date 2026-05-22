import React from 'react';
import { useLocation } from 'react-router-dom';
import RunningInterviews from './RunningInterviews';
import InterviewsCompleted from './InterviewsCompleted';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatViewLocationState {
  interviewsDone?: boolean;
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
  const state = location.state as ChatViewLocationState | null;

  if (state?.interviewsDone) {
    return <InterviewsCompleted />;
  }

  return <RunningInterviews />;
};

export default ChatView;