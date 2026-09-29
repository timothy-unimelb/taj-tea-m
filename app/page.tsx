import { BarrierBrainPrototype } from "@/components/barrier-brain-prototype";
import { getAssessmentData } from "@/lib/data";

export default function Home() {
  return <BarrierBrainPrototype data={getAssessmentData()} />;
}
