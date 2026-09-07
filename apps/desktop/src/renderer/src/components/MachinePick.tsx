import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { DEFAULT_MACHINE_LIMITS, type MachinePlacement, type StoredMachinePlacement } from '@blobot/core/domain';
import type { EngineSetupView } from '../../../shared/api.js';

export function MachineCapacity({ host, placements }: { host: EngineSetupView['host']; placements: readonly StoredMachinePlacement[] }): React.JSX.Element | null {
  if (host === undefined || !placements.some((placement) => placement.kind === 'box')) return null;
  const boxes = placements.filter((placement) => placement.kind === 'box');
  const memory = boxes.reduce((total, placement) => total + placement.limits.maxMemoryBytes, 0);
  const cpus = boxes.reduce((total, placement) => total + placement.limits.maxCpus, 0);
  return <div className="note muted">
    <p>This computer: <span className="mono">{host.cpus} CPUs · {Math.round(host.memoryBytes / 1024 ** 3)} GiB RAM</span>.</p>
    <p>These sandboxes may use up to <span className="mono">{cpus} CPUs · {memory / 1024 ** 3} GiB RAM</span> together.
      {memory > host.memoryBytes ? ' Their memory limits exceed this computer’s memory. Reduce them or run fewer agents at once.' : ' Leave room for this computer’s other apps.'}</p>
  </div>;
}

function choicesIncluding(values: readonly number[], current: number): number[] {
  return [...new Set([...values, current])].sort((a, b) => a - b);
}

export function MachineSelect({ label, value, onChange, choices }: {
  label: string; value: string; onChange: (value: string) => void;
  choices: readonly { value: string; label: string; detail?: string; disabled?: boolean }[];
}): React.JSX.Element {
  return <Select.Root value={value} onValueChange={onChange}>
    <Select.Trigger className="field selecttrigger" aria-label={label}>
      <Select.Value /><Select.Icon><ChevronDown size={14} aria-hidden /></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content className="selectmenu" position="popper" sideOffset={6}><Select.Viewport>
      {choices.map((choice) => <Select.Item key={choice.value} value={choice.value} disabled={choice.disabled ?? false} className="selectitem trustitem">
        <Select.ItemText>{choice.label}</Select.ItemText>
        <Select.ItemIndicator className="selecttick"><Check size={13} aria-hidden /></Select.ItemIndicator>
        {choice.detail && <span className="trustsays">{choice.detail}</span>}
      </Select.Item>)}
    </Select.Viewport></Select.Content></Select.Portal>
  </Select.Root>;
}

export function MachinePick({ label, value, onChange, previewEnabled = false }: {
  label: string; value: StoredMachinePlacement; onChange: (value: MachinePlacement) => void; previewEnabled?: boolean;
}): React.JSX.Element {
  return <div className="machinepick">
    <MachineSelect label={label} value={value.kind} onChange={(kind) => onChange(kind === 'box'
      ? { kind: 'box', limits: DEFAULT_MACHINE_LIMITS } : { kind: 'local' })} choices={[
      ...value.kind === 'invalid' ? [{ value: 'invalid', label: 'unavailable — choose where this agent works', disabled: true }] : [],
      { value: 'local', label: 'this computer', detail: 'Uses your installed runtime and its existing login.' },
      { value: 'box', label: 'a sandbox on this computer', disabled: !previewEnabled,
        detail: previewEnabled ? 'Preview. Private home and login; additional download, memory and disk.' : 'Awaiting release validation. Sandbox preview is disabled in this build.' },
    ]} />
    {value.kind === 'invalid' && <p className="refusal">{value.detail}</p>}
    {value.kind === 'box' && <div className="machinelimits">
      <MachineSelect label={`${label}: CPUs`} value={String(value.limits.maxCpus)} onChange={(next) => onChange({
        kind: 'box', limits: { ...value.limits, maxCpus: Number(next) },
      })} choices={choicesIncluding([1, 2, 4, 8], value.limits.maxCpus).map((count) => ({ value: String(count), label: `up to ${count} CPU${count === 1 ? '' : 's'}` }))} />
      <MachineSelect label={`${label}: memory`} value={String(value.limits.maxMemoryBytes / 1024 ** 3)} onChange={(next) => onChange({
        kind: 'box', limits: { ...value.limits, maxMemoryBytes: Number(next) * 1024 ** 3 },
      })} choices={choicesIncluding([1, 2, 4, 8, 16], value.limits.maxMemoryBytes / 1024 ** 3).map((count) => ({ value: String(count), label: `up to ${count} GiB RAM` }))} />
    </div>}
  </div>;
}
