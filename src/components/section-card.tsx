import type { ReactNode } from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface SectionCardProps {
  id: string
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}

export function SectionCard({
  id,
  title,
  description,
  actions,
  children,
}: SectionCardProps) {
  return (
    <section id={id} className="scroll-mt-6">
      <Card className="border bg-card/95 shadow-sm">
        <CardHeader>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {actions ? <CardAction>{actions}</CardAction> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  )
}
