import { listPopulationSimulations, downloadQuestionnaireCsvExport } from '../services/quantitativeServices';

/**
 * Download questionnaire CSV for the latest population simulation on an exploration.
 */
export async function downloadLatestQuestionnaireCsvForExploration({ workspaceId, explorationId }) {
  const sims = await listPopulationSimulations({ workspaceId, explorationId });
  if (!sims?.length) {
    throw new Error(
      'NO_SIMULATION: No saved population run for this exploration yet. Complete Population Builder first.'
    );
  }
  const sorted = [...sims].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  const latest = sorted[0];
  try {
    await downloadQuestionnaireCsvExport({
      workspaceId,
      explorationId,
      simulationId: latest.id,
    });
  } catch (e) {
    if (e.response?.status === 404) {
      throw new Error('NO_QUESTIONNAIRE: No questionnaire stored for the latest simulation.');
    }
    throw e;
  }
}

export function alertQuestionnaireExportError(err) {
  const msg = err?.message || '';
  if (msg.includes('NO_SIMULATION')) {
    alert(msg.replace(/^NO_SIMULATION:\s*/, ''));
    return;
  }
  if (msg.includes('NO_QUESTIONNAIRE')) {
    alert(msg.replace(/^NO_QUESTIONNAIRE:\s*/, ''));
    return;
  }
  alert('Could not download questionnaire CSV. Try again later.');
}
