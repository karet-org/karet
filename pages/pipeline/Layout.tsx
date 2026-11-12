import { Outlet } from "react-router";
import SideNav from "@/components/layout/SideNav";
import { useParams } from "@/lib/client/navigation";

export default function PipelineLayout() {
  const { pipeline } = useParams<{ pipeline: string }>();
  return (
    // Fixed-height shell: the content pane scrolls, not the body.
    // (sticky is defeated by the body's overflow-x: hidden.)
    <div className="md:flex md:h-screen md:overflow-hidden">
      <SideNav key={pipeline} pipeline={pipeline} />
      <div className="min-w-0 flex-1 md:overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
