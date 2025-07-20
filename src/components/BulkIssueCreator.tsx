import React, { useState } from 'react';

interface BulkIssueCreatorProps {
  createIssues: (issues: { title: string; body: string; labels: string[] }[]) => void;
  parseIssues: (text: string) => Promise<any[]>;
  isCreating: boolean;
}

function BulkIssueCreator({ createIssues, parseIssues, isCreating }: BulkIssueCreatorProps) {
  const [text, setText] = useState('');
  const [parsedIssues, setParsedIssues] = useState<any[]>([]);

  const handleParse = async () => {
    const issues = await parseIssues(text);
    setParsedIssues(issues);
  };

  const handleCreate = () => {
    createIssues(parsedIssues);
    setParsedIssues([]);
    setText('');
  };

  return (
    <div className="p-4 border-t border-white/10">
      <h3 className="text-lg font-semibold mb-2">Bulk Create Issues</h3>
      <textarea
        className="w-full h-40 p-2 bg-gray-800 border border-white/10 rounded-md text-white"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a list of issues, each on a new line. You can also include labels in brackets, e.g., [bug], [feature]."
      />
      <div className="flex justify-end mt-2">
        <button
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
          onClick={handleParse}
          disabled={isCreating || !text}
        >
          Parse Issues
        </button>
      </div>
      {parsedIssues.length > 0 && (
        <div className="mt-4">
          <h4 className="text-md font-semibold mb-2">Parsed Issues</h4>
          <ul className="space-y-2">
            {parsedIssues.map((issue, index) => (
              <li key={index} className="p-2 bg-gray-800 rounded-md">
                <p className="font-semibold">{issue.title}</p>
                <p className="text-sm text-gray-400">{issue.body}</p>
                {issue.labels.length > 0 && (
                  <div className="mt-1">
                    {issue.labels.map((label: string, i: number) => (
                      <span key={i} className="inline-block bg-blue-500/20 text-blue-300 px-2 py-1 text-xs rounded-full mr-1">
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="flex justify-end mt-2">
            <button
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              onClick={handleCreate}
              disabled={isCreating}
            >
              Create {parsedIssues.length} Issues
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BulkIssueCreator;
