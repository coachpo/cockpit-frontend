import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

import { SectionCard } from "@/components/section-card"

interface JsonEditorCardProps {
  id: string
  title: string
  description: string
  value: string
  onChange: (value: string) => void
  onRefresh: () => void
  onSave: () => void
  disabled?: boolean
  helper?: ReactNode
  saveLabel?: string
}

export function JsonEditorCard({
  id,
  title,
  description,
  value,
  onChange,
  onRefresh,
  onSave,
  disabled = false,
  helper,
  saveLabel = "Save",
}: JsonEditorCardProps) {
  return (
    <SectionCard
      id={id}
      title={title}
      description={description}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={disabled}>
            Refresh
          </Button>
          <Button size="sm" onClick={onSave} disabled={disabled}>
            {saveLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {helper ? <div className="text-sm text-muted-foreground">{helper}</div> : null}
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-64 font-mono text-xs"
          spellCheck={false}
        />
      </div>
    </SectionCard>
  )
}
