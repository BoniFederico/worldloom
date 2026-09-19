type Option = { value: string; label: string };

type Props = {
  legend: string;
  current: string;
  options: Option[];
  action: (formData: FormData) => Promise<void>;
};

/** Gruppo di pulsanti che funziona anche senza JavaScript (form + server action). */
export function PreferenceGroup({ legend, current, options, action }: Props) {
  return (
    <form action={action} className="pref" role="group" aria-label={legend}>
      {options.map((o) => (
        <button
          key={o.value}
          type="submit"
          name="value"
          value={o.value}
          aria-pressed={o.value === current}
          className="pref-btn"
        >
          {o.label}
        </button>
      ))}
    </form>
  );
}
