import { useEffect, useState } from "react";

// ---------------------
// Interfaces
// ---------------------
interface DomNode {
  tag: string;
  role: string | null;
  text: string | null;
  placeholder: string | null;
  contentEditable: boolean | null;
  isProseMirror: boolean;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  id: string | null;
  classes: string | null;
  reactEvent: boolean | null;
}

interface ActionData {
  action: string;
  selector: string | null;
  desiredOption: string | null;
  text: string;
  direction: string | null;
  boundingBox: unknown;
  reason: string | null;
}

interface StepData {
  step: number;
  label: string;
  action: ActionData;
  gcsUrl: string;
  domSample: DomNode[];
}

// ---------------------
// Utility helpers
// ---------------------
const prettyTitle = (slug: string) =>
  slug
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const syntaxHighlight = (json: unknown) => {
  const str = JSON.stringify(json, null, 2);

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|\b[-]?\d+(\.\d+)?\b)/g,
      (match) => {
        let cls = "text-gray-700"; // default text

        if (/^"/.test(match)) {
          cls = /:$/.test(match)
            ? "text-blue-600"         // keys
            : "text-gray-800";        // strings
        } else if (/true|false/.test(match)) {
          cls = "text-purple-600";
        } else if (/null/.test(match)) {
          cls = "text-gray-500";
        } else {
          cls = "text-green-700";    // numbers
        }

        return `<span class="${cls}">${match}</span>`;
      }
    );
};


// ---------------------
// Component
// ---------------------
export default function DatasetViewer() {
  const [folders, setFolders] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [stepFiles, setStepFiles] = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [stepData, setStepData] = useState<StepData | null>(null);

  // Load folder list
  useEffect(() => {
    fetch("/dataset/index.json")
      .then((r) => r.json())
      .then((data: string[]) => setFolders(data));
  }, []);

  // Load steps list for folder
  const loadFolder = async (folder: string) => {
    setCurrentFolder(folder);

    const res = await fetch(`/dataset/${folder}/index.json`);
    const files: string[] = await res.json();

    const jsonSteps = files.filter(
      (f) => f.endsWith(".json") && f !== "meta.json"
    );

    setStepFiles(jsonSteps);
    setCurrentStepIndex(0);
    loadStep(folder, jsonSteps[0]);
  };

  // Load step JSON
  const loadStep = async (folder: string, file: string) => {
    const res = await fetch(`/dataset/${folder}/${file}`);
    const json: StepData = await res.json();
    setStepData(json);
  };

  // Step navigation
  const nextStep = () => {
    if (currentFolder && currentStepIndex < stepFiles.length - 1) {
      const idx = currentStepIndex + 1;
      setCurrentStepIndex(idx);
      loadStep(currentFolder, stepFiles[idx]);
    }
  };

  const prevStep = () => {
    if (currentFolder && currentStepIndex > 0) {
      const idx = currentStepIndex - 1;
      setCurrentStepIndex(idx);
      loadStep(currentFolder, stepFiles[idx]);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") nextStep();
      if (e.key === "ArrowLeft") prevStep();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <div className="flex h-screen bg-gray-200">
      {/* SIDEBAR */}
      <aside className="w-80 bg-white border-r shadow-xl overflow-y-auto">
        <h2 className="text-lg font-semibold p-4 border-b bg-gray-100 sticky top-0 z-10">
          Dataset Tasks
        </h2>

        {folders.map((folder) => (
          <button
            key={folder}
            onClick={() => loadFolder(folder)}
            className={`w-full text-left p-3 border-b transition font-medium
              ${
                currentFolder === folder
                  ? "bg-blue-100 text-blue-700"
                  : "hover:bg-gray-100 text-gray-800"
              }`}
          >
            {prettyTitle(folder)}
          </button>
        ))}
      </aside>

      {/* MAIN PANEL */}
      <main className="flex-1 flex flex-col p-6 overflow-hidden min-h-0">
        <div className="flex-1 min-h-0 bg-white rounded-lg shadow-lg border overflow-hidden mb-4 flex flex-col">


  {/* Title */}
  <div className="p-3 border-b bg-gray-50 text-lg font-semibold text-gray-800">
    {currentFolder ? prettyTitle(currentFolder) : "Select a Dataset"}
  </div>

  {/* Image */}
  <div className="flex-1 min-h-0 flex items-center justify-center">
    {!stepData ? (
      <div className="text-gray-400">Select a dataset</div>
    ) : (
      <img
        key={stepData.gcsUrl}
        src={stepData.gcsUrl}
        alt="step"
        className="max-h-full max-w-full object-contain"
        style={{ objectFit: "contain" }}
      />
    )}
  </div>
</div>

{/* REASONING PANEL */}
{stepData?.action?.reason && (
  <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-400 rounded shadow-sm text-blue-900">
    <p className="font-semibold mb-1">Reasoning</p>
    <p>{String(stepData.action.reason)}</p>
  </div>
)}


        {/* NAVIGATION */}
        {stepData && (
          <div className="flex justify-between mb-4 items-center">
            <button
              onClick={prevStep}
              disabled={currentStepIndex === 0}
              className="px-4 py-2 bg-gray-300 rounded disabled:opacity-40 hover:bg-gray-400"
            >
              ◀ Prev
            </button>

            <span className="px-4 py-1 bg-gray-700 text-white rounded-full text-sm shadow">
              Step {currentStepIndex + 1} of {stepFiles.length}
            </span>

            <button
              onClick={nextStep}
              disabled={currentStepIndex === stepFiles.length - 1}
              className="px-4 py-2 bg-gray-300 rounded disabled:opacity-40 hover:bg-gray-400"
            >
              Next ▶
            </button>
          </div>
        )}

        {/* JSON VIEWER */}
        <div
  className="h-72 bg-gray-100 text-gray-800 p-4 rounded-lg shadow-inner overflow-y-auto text-xs font-mono border"
  dangerouslySetInnerHTML={{
    __html: stepData ? syntaxHighlight(stepData) : "{}",
  }}
/>
      </main>
    </div>
  );
}
