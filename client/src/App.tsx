import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "@/lib/api";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import HomePage from "@/pages/HomePage";
import EventPage from "@/pages/EventPage";
import BigScreenPage from "@/pages/BigScreenPage";
import UsersPage from "@/pages/UsersPage";
import LibraryPage from "@/pages/LibraryPage";

export default function App() {
  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
  });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      {/* Outside the layout: this one owns the whole screen. */}
      <Route path="/events/:id/sessions/:slotId/screen" element={<BigScreenPage />} />
      <Route element={<Layout user={me} />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/events/:id" element={<EventPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route
          path="/users"
          element={me.isAdmin ? <UsersPage /> : <Navigate to="/" replace />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
