import { getCircuit } from '../circuits/presets';
import type { StepResult } from '../circuits/sequencer';
import { cleanText, hasWork, movementName, resultText, seconds } from './format';
import { Layout } from './Layout';
import styles from './Summary.module.css';

export interface CircuitSummaryProps {
  circuitId: string;
  results: readonly StepResult[];
  onHome(): void;
}

/** Per-step results and totals of a finished circuit. Skipped and empty steps are marked in words. */
export function CircuitSummary({ circuitId, results, onHome }: CircuitSummaryProps) {
  const circuit = getCircuit(circuitId);
  const done = results.filter((r) => r.summary && hasWork(r.summary));
  const reps = done.reduce((n, r) => n + (r.summary?.reps ?? 0), 0);
  const holdMs = done.reduce((n, r) => n + (r.summary?.holdMs ?? 0), 0);
  return (
    <Layout title={`${circuit?.name ?? 'Circuit'}: done`}>
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Sets done</dt>
          <dd>
            {done.length} of {results.length}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt>Total reps</dt>
          <dd>{reps}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Total hold</dt>
          <dd>{seconds(holdMs)}</dd>
        </div>
      </dl>
      <table className={styles.table}>
        <caption className="visually-hidden">Results per step</caption>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Result</th>
            <th scope="col">Clean</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.index}>
              <th scope="row">
                {r.index + 1}. {movementName(r.movementId)}
              </th>
              {r.summary === null ? (
                <td colSpan={2}>Skipped</td>
              ) : !hasWork(r.summary) ? (
                <td colSpan={2}>No reps yet</td>
              ) : (
                <>
                  <td>{resultText(r.summary)}</td>
                  <td>{cleanText(r.summary)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.actions}>
        <button type="button" className="btn btn-primary" onClick={onHome}>
          Home
        </button>
      </div>
    </Layout>
  );
}
