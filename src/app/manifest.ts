import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProjectOS — Project Management Portal",
    short_name: "ProjectOS",
    description:
      "In-house, Jira-class project management: kanban boards, sprints, backlog planning, workflow automation, reports and email notifications.",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#1c1917",
    theme_color: "#d97706",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/logo-mark.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
