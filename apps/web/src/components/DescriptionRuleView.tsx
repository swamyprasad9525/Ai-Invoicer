import React, { useState } from 'react';
import {
  BookOpenCheck,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Play
} from 'lucide-react';
import { ApiClient } from '../lib/api';

interface DescriptionRuleViewProps {
  rule: any;
  onRefresh: () => void;
}

export const DescriptionRuleView: React.FC<DescriptionRuleViewProps> = ({ rule, onRefresh }) => {
  const [aliases, setAliases] = useState<Record<string, string>>(
    rule?.aliases || {
      'Tandur Yellow Limestone': 'T.YELLOW',
      'T. Yellow': 'T.YELLOW',
      'Half Honed': 'H/H',
      'Tumbled': 'T/B',
      'Handcut': 'H/C',
      'Straight Handcut': 'H/C',
      'Brushed': 'BRUSHED',
      'Natural': 'NATURAL',
      'Palisade': 'PALISADE',
      'Tiles': 'TILES',
      'French Opus': 'FRENCH OPUS'
    }
  );

  const [newKey, setNewKey] = useState<string>('');
  const [newVal, setNewVal] = useState<string>('');
  const [unknownPolicy, setUnknownPolicy] = useState<string>(rule?.unknownTermPolicy || 'review_required');
  const [saving, setSaving] = useState<boolean>(false);

  // Live test sandbox state
  const [testMaterial, setTestMaterial] = useState<string>('Tandur Yellow Limestone');
  const [testCategory, setTestCategory] = useState<string>('French Opus');
  const [testSize, setTestSize] = useState<string>('100x50 cm');
  const [testThickness, setTestThickness] = useState<string>('2 cm');
  const [testTopFinish, setTestTopFinish] = useState<string>('Half Honed');
  const [testCrates, setTestCrates] = useState<number>(3);
  const [transformResult, setTransformResult] = useState<any>(null);

  const handleAddAlias = () => {
    if (!newKey.trim() || !newVal.trim()) return;
    setAliases({ ...aliases, [newKey.trim()]: newVal.trim().toUpperCase() });
    setNewKey('');
    setNewVal('');
  };

  const handleRemoveAlias = (key: string) => {
    const updated = { ...aliases };
    delete updated[key];
    setAliases(updated);
  };

  const handleSaveRule = async () => {
    try {
      setSaving(true);
      await ApiClient.saveDescriptionRule({
        fieldOrder: rule?.fieldOrder || ['stone', 'pattern', 'size', 'thickness', 'topFinish', 'edgeFinish', 'finalFinish', 'crateCount'],
        aliases,
        categoryPolicies: rule?.categoryPolicies || [{ category: 'French Opus', includePatternBreakdown: true }],
        crateSuffix: 'CRT',
        unknownTermPolicy: unknownPolicy
      });
      alert('Description rule saved and versioned successfully!');
      onRefresh();
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRunTest = async () => {
    try {
      const res = await ApiClient.testTransform(
        {
          material: testMaterial,
          category: testCategory,
          size: testSize,
          thickness: testThickness,
          topFinish: testTopFinish ? [testTopFinish] : [],
          crateCount: testCrates
        },
        {
          ruleVersion: rule?.ruleVersion || 1,
          aliases,
          crateSuffix: 'CRT',
          unknownTermPolicy: unknownPolicy,
          categoryPolicies: [{ category: 'French Opus', includePatternBreakdown: true }]
        }
      );
      setTransformResult(res);
    } catch (err: any) {
      alert(`Test failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl glass-panel">
        <div>
          <div className="flex items-center gap-2 text-teal-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <BookOpenCheck className="w-4 h-4" />
            <span>Description Intelligence Engine (M05)</span>
          </div>
          <h2 className="text-xl font-bold text-white">Terminology Rules & Aliases</h2>
          <p className="text-xs text-slate-400 mt-1">
            Version: <strong>v{rule?.ruleVersion || 1}</strong> • Never learn rules silently: all aliases are deterministic and audited.
          </p>
        </div>

        <button
          onClick={handleSaveRule}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-teal-500/20 transition-all"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Versioning...' : 'Save New Rule Version'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Alias Dictionary */}
        <div className="lg:col-span-2 p-6 rounded-2xl glass-panel space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-white">Approved Aliases & Abbreviations</h3>
            <span className="text-xs text-slate-400">{Object.keys(aliases).length} active terms</span>
          </div>

          {/* Add New Alias Form */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <input
              type="text"
              placeholder="PO Raw Term (e.g. Half Honed)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
            />
            <span className="text-slate-500 font-bold">→</span>
            <input
              type="text"
              placeholder="Commercial Alias (e.g. H/H)"
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-teal-300 font-bold"
            />
            <button
              onClick={handleAddAlias}
              className="px-3 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition-all flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          {/* Terms Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-96 overflow-y-auto pr-1">
            {Object.entries(aliases).map(([key, val]) => (
              <div
                key={key}
                className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs"
              >
                <div className="truncate">
                  <span className="text-slate-300 font-medium">{key}</span>
                  <span className="text-slate-500 mx-1.5">→</span>
                  <span className="text-teal-400 font-bold font-mono">{val}</span>
                </div>
                <button
                  onClick={() => handleRemoveAlias(key)}
                  className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Unknown Term Policy */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Unknown Term Policy:</span>
            <select
              value={unknownPolicy}
              onChange={(e) => setUnknownPolicy(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-teal-300 font-semibold"
            >
              <option value="review_required">review_required (Flag for human approval)</option>
              <option value="passthrough">passthrough (Use raw text in uppercase)</option>
            </select>
          </div>
        </div>

        {/* Right Column: Live Interactive Sandbox */}
        <div className="p-6 rounded-2xl glass-panel space-y-4">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm border-b border-slate-800 pb-3">
            <Sparkles className="w-4 h-4" />
            <span>Live Rule Transformation Sandbox</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Stone Name</label>
              <input
                type="text"
                value={testMaterial}
                onChange={(e) => setTestMaterial(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Category / Pattern</label>
              <input
                type="text"
                value={testCategory}
                onChange={(e) => setTestCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">Size</label>
                <input
                  type="text"
                  value={testSize}
                  onChange={(e) => setTestSize(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Thickness</label>
                <input
                  type="text"
                  value={testThickness}
                  onChange={(e) => setTestThickness(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">Top Finish</label>
                <input
                  type="text"
                  value={testTopFinish}
                  onChange={(e) => setTestTopFinish(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Crates</label>
                <input
                  type="number"
                  value={testCrates}
                  onChange={(e) => setTestCrates(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                />
              </div>
            </div>

            <button
              onClick={handleRunTest}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-teal-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-all mt-2"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Test Transform Description</span>
            </button>

            {transformResult && (
              <div className="mt-3 p-3.5 rounded-xl bg-slate-950/80 border border-teal-500/30 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
                  Transformed Commercial Output:
                </div>
                <div className="text-xs font-mono font-bold text-white leading-relaxed">
                  {transformResult.commercialDescription}
                </div>
                {transformResult.patternBreakdown && (
                  <div className="text-[10px] font-mono text-teal-300">
                    {transformResult.patternBreakdown}
                  </div>
                )}
                {transformResult.warnings?.length > 0 && (
                  <div className="text-[10px] text-amber-300 flex items-center gap-1 pt-1 border-t border-slate-800">
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>{transformResult.warnings[0]}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
