import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ProjectSettings as ProjectSettingsType } from "@/types/api";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ProjectSettingsProps {
  projectId: string;
}

const RETENTION_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
];

export function ProjectSettings({ projectId }: ProjectSettingsProps) {
  const [settings, setSettings] = useState<ProjectSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [retentionDays, setRetentionDays] = useState<string>("30");
  const [sampleRate, setSampleRate] = useState<string>("1.0");
  const [sampleRateError, setSampleRateError] = useState<string>("");

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.settings.get(projectId);
      setSettings(data);
      setRetentionDays(String(data.retention_days));
      setSampleRate(String(data.sample_rate));
    } catch (err) {
      toast.error("Failed to load settings", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  function validateSampleRate(value: string): boolean {
    const num = Number(value);
    if (!value || !Number.isFinite(num) || num < 0 || num > 1) {
      setSampleRateError("Sample rate must be between 0.0 and 1.0");
      return false;
    }
    setSampleRateError("");
    return true;
  }

  async function handleSave() {
    if (!validateSampleRate(sampleRate)) return;

    setSaving(true);
    try {
      await api.settings.update(projectId, {
        retention_days: Number(retentionDays),
        sample_rate: Number(sampleRate),
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Failed to save settings", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }

  const hasChanges =
    settings !== null &&
    (String(settings.retention_days) !== retentionDays ||
      String(settings.sample_rate) !== sampleRate);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-9 w-32" />
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="space-y-2">
        <Label htmlFor="retention-days">Retention Days</Label>
        <p className="text-xs text-muted-foreground">
          How long to keep event data before automatic cleanup
        </p>
        <Select value={retentionDays} onValueChange={setRetentionDays}>
          <SelectTrigger id="retention-days" className="w-full">
            <SelectValue placeholder="Select retention period" />
          </SelectTrigger>
          <SelectContent>
            {RETENTION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sample-rate">Sample Rate</Label>
        <p className="text-xs text-muted-foreground">
          1.0 = keep all events, 0.5 = keep 50%
        </p>
        <Input
          id="sample-rate"
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={sampleRate}
          onChange={(e) => {
            setSampleRate(e.target.value);
            validateSampleRate(e.target.value);
          }}
          aria-invalid={!!sampleRateError}
          className="w-full"
        />
        {sampleRateError && (
          <p className="text-sm text-destructive">{sampleRateError}</p>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving || !hasChanges}>
        {saving && <Loader2 className="animate-spin" />}
        Save Settings
      </Button>
    </div>
  );
}
