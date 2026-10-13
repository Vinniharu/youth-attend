import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Placeholder home. Replaced by the member check-in screen in Phase 4.
export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Badge variant="secondary" className="mb-2 w-fit">
            Phase 0
          </Badge>
          <CardTitle>Youth Attendance</CardTitle>
          <CardDescription>Scaffold is running. Check-in arrives in a later phase.</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
