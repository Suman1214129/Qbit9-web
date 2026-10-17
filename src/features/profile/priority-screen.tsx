"use client";
import { PRIORITY_TAGS, type PriorityTag } from "@/domain";
import { Switch } from "@/components/ui";
import { TopBar } from "@/components/layout";
import { useUpdateProfile } from "@/hooks/mutations";
import { useSession } from "@/hooks/queries";

const COPY: Record<PriorityTag, { title: string; detail: string }> = {
  senior_citizen: { title: "Senior citizen", detail: "60 years or older." },
  pensioner: { title: "Pensioner", detail: "You draw a pension through this bank." },
  disability: { title: "Disability", detail: "Staff can bring you forward and help at the counter." },
};

export function PriorityScreen() {
  const { data: session } = useSession();
  const update = useUpdateProfile();
  const current = session?.user.priority ?? [];
  const toggle = (t: PriorityTag, on: boolean) => update.mutate({ priority: on ? [...current, t] : current.filter((x) => x !== t) });
  return (
    <div className="pb-4">
      <TopBar title="Priority" back="/profile" />
      <div className="mx-auto max-w-[640px] pt-2">
        <p className="py-3 text-sm leading-snug text-muted">Used as the starting point each time you join. You can change it for a single visit on the review screen. Staff may check at the counter.</p>
        {PRIORITY_TAGS.map((t) => (
          <div key={t} className="flex items-center gap-3 border-b border-dashed border-line py-3">
            <div className="flex-1 text-[15px] font-medium">{COPY[t].title}<small className="block text-[12.5px] font-normal text-muted">{COPY[t].detail}</small></div>
            <Switch checked={current.includes(t)} onChange={(v) => toggle(t, v)} label={COPY[t].title} />
          </div>
        ))}
      </div>
    </div>
  );
}
