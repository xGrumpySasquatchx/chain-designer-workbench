export const TIPS = {
  slack:
    'Slack is unused capacity that absorbs failed ligations, low-titer preps and instrument downtime. The engine exists to make the cost of consuming slack visible before you consume it.',
  rho: 'Utilization ρ is busy time over available time. Queue wait scales as ρ/(1−ρ), so the same extra plate hurts far more at 90% than at 70%.',
  waitMultiplier:
    'Wait multiplier ρ/(1−ρ). At 50% utilization it is 1. At 85% it is 5.7. At 90% it is 9. Identical load increments are not identical delays.',
  kingman:
    'Kingman / VUT wait: ((Ca²+Cs²)/2) × (ρ/(1−ρ)) × te. Variability, utilization, time. The lever that helps depends on which term dominates.',
  batch:
    'Wet-lab stages have a batch quantum. Twenty constructs that fit 34 open wells cost zero extra plate cycles. One construct that forces a 97th well costs a full cycle downstream.',
  yield:
    'End-to-end yield on this spine is 41%. Asking for 48 purified proteins means designing ~117 constructs. Quoting the requested number understates every utilization figure by more than half.',
  binding:
    'Most of the extra delay comes from one stage. Lead with that binding constraint; the other fourteen stages are noise for this decision.',
  shock:
    'A 7% demand increase produces about a 49% increase in total queue time on this model, and ~71% of that delay sits at transient expression.',
  ceiling:
    'Each resource has a slack policy — the utilization above which a breach is raised. Humans 80%, instruments 85%, robots / in-silico 90%. Stages with rework sit lower.',
  infeasible:
    'ρ ≥ 1 is not “slow”. Kingman does not apply. The stage cannot finish inside the horizon without more cycles.',
  accept:
    'Accept keeps Accept available even when a ceiling is breached. You may know something the model does not. Infeasible is the only state that blocks it.',
  decline:
    'Decline is recorded, not discarded. The shadow backlog is the evidence base for another shaker or AKTA.',
  calibrate:
    'A forecast that hides its error rate gets ignored. Median absolute percent error on the last 20 completed items is shown even when it is poor.',
  ribbon:
    'The ribbon is the preventive surface: utilization against ceiling with the candidate painted on. The wall should be visible before it is hit.',
  vutV: 'Arrival + service variability (Ca² + Cs²)/2. High variability is fixed by batching discipline and rework reduction.',
  vutU: 'Utilization term ρ/(1−ρ). High utilization is fixed by scope, deferral or consolidation.',
  vutT: 'Service time te. High te is fixed by rerouting (robot vs human, in-house vs CRO).',
} as const;
