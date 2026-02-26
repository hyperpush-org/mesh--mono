import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export interface CreateRulePayload {
  name: string;
  condition: {
    condition_type: "threshold" | "new_issue" | "regression";
    threshold?: number;
    window_minutes?: number;
  };
  action: { type: string; url: string };
  cooldown_minutes: number;
  enabled: boolean;
}

interface AlertRuleFormProps {
  projectId: string;
  onSubmit: (rule: CreateRulePayload) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const CONDITION_TYPES = [
  { value: "threshold", label: "Event Count Threshold" },
  { value: "new_issue", label: "New Issue" },
  { value: "regression", label: "Issue Regression" },
] as const;

export function AlertRuleForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: AlertRuleFormProps) {
  const [name, setName] = useState("");
  const [conditionType, setConditionType] = useState<string>("threshold");
  const [threshold, setThreshold] = useState<string>("100");
  const [windowMinutes, setWindowMinutes] = useState<string>("5");
  const [cooldownMinutes, setCooldownMinutes] = useState<string>("60");

  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Name is required";
    }

    if (conditionType === "threshold") {
      const thresholdNum = Number(threshold);
      if (!threshold || thresholdNum <= 0 || !Number.isFinite(thresholdNum)) {
        newErrors.threshold = "Threshold must be greater than 0";
      }
      const windowNum = Number(windowMinutes);
      if (
        !windowMinutes ||
        windowNum <= 0 ||
        !Number.isFinite(windowNum)
      ) {
        newErrors.windowMinutes = "Window must be greater than 0";
      }
    }

    const cooldownNum = Number(cooldownMinutes);
    if (
      !cooldownMinutes ||
      cooldownNum <= 0 ||
      !Number.isFinite(cooldownNum)
    ) {
      newErrors.cooldownMinutes = "Cooldown must be greater than 0";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload: CreateRulePayload = {
      name: name.trim(),
      condition: {
        condition_type: conditionType as
          | "threshold"
          | "new_issue"
          | "regression",
        ...(conditionType === "threshold"
          ? {
              threshold: Number(threshold),
              window_minutes: Number(windowMinutes),
            }
          : {}),
      },
      action: { type: "webhook", url: "" },
      cooldown_minutes: Number(cooldownMinutes),
      enabled: true,
    };

    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rule-name">Name</Label>
        <Input
          id="rule-name"
          placeholder="e.g. High error volume"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="condition-type">Condition Type</Label>
        <Select value={conditionType} onValueChange={setConditionType}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select condition type" />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_TYPES.map((ct) => (
              <SelectItem key={ct.value} value={ct.value}>
                {ct.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {conditionType === "threshold" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="threshold">Threshold (event count)</Label>
            <Input
              id="threshold"
              type="number"
              min={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              aria-invalid={!!errors.threshold}
            />
            {errors.threshold && (
              <p className="text-sm text-destructive">{errors.threshold}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="window-minutes">Window (minutes)</Label>
            <Input
              id="window-minutes"
              type="number"
              min={1}
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(e.target.value)}
              aria-invalid={!!errors.windowMinutes}
            />
            {errors.windowMinutes && (
              <p className="text-sm text-destructive">
                {errors.windowMinutes}
              </p>
            )}
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="cooldown-minutes">Cooldown (minutes)</Label>
        <Input
          id="cooldown-minutes"
          type="number"
          min={1}
          value={cooldownMinutes}
          onChange={(e) => setCooldownMinutes(e.target.value)}
          aria-invalid={!!errors.cooldownMinutes}
        />
        {errors.cooldownMinutes && (
          <p className="text-sm text-destructive">
            {errors.cooldownMinutes}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Minimum minutes between repeated alerts for this rule
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          Create Rule
        </Button>
      </div>
    </form>
  );
}
