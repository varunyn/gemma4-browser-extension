import Chat from "./chat/Chat.tsx";
import SettingsHeader from "./components/SettingsHeader.tsx";

export default function App() {
  return (
    <div className="h-full w-full flex flex-col">
      <SettingsHeader />
      <main className="flex-1 overflow-y-auto bg-chrome-bg-primary">
        <Chat />
      </main>
    </div>
  );
}
