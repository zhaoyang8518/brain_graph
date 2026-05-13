import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ModelProvider } from "../model";
import type { EmbeddingProvider } from "../embedding";
import type { Language } from "../i18n";

interface SettingsDialogProps {
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
  t: (key: string) => string;
  language: Language;
  setLanguage: (lang: Language) => void;
  modelSettings: any;
  setModelSettings: (settings: any) => void;
  availableModels: string[];
  setAvailableModels: (models: string[]) => void;
  modelTestState: { loading: boolean; message: string; ok?: boolean };
  setModelTestState: (state: { loading: boolean; message: string; ok?: boolean }) => void;
  handleTestModelConnection: () => Promise<void>;
  embeddingSettings: any;
  setEmbeddingSettings: (settings: any) => void;
  embeddingProviderLabel: (provider: EmbeddingProvider) => string;
  defaultEmbeddingSettingsForProvider: (provider: EmbeddingProvider) => any;
  handleSaveSettings: () => void;
}

export function SettingsDialog({
  isSettingsOpen,
  setIsSettingsOpen,
  t,
  language,
  setLanguage,
  modelSettings,
  setModelSettings,
  availableModels,
  setAvailableModels,
  modelTestState,
  setModelTestState,
  handleTestModelConnection,
  embeddingSettings,
  setEmbeddingSettings,
  embeddingProviderLabel,
  defaultEmbeddingSettingsForProvider,
  handleSaveSettings,
}: SettingsDialogProps) {
  return (
    <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
      <DialogContent data-view="settings" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{t("settings")}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList data-section="settings-tabs" className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger data-tab="general" value="general">{t("general")}</TabsTrigger>
            <TabsTrigger data-tab="models" value="model">{t("models")}</TabsTrigger>
            <TabsTrigger data-tab="advanced" value="advanced">{t("advanced")}</TabsTrigger>
          </TabsList>

          <TabsContent data-section="settings-general" value="general" className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("language")}</label>
              <Select value={language} onValueChange={(val: Language) => setLanguage(val)}>
                <SelectTrigger data-field="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">中文 (Chinese)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent data-section="settings-models" value="model" className="space-y-6">
            <div data-setting="model-extraction" className="flex items-center justify-between p-4 rounded-xl border bg-muted/20">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{t("enableModel")}</div>
                <div className="text-xs text-muted-foreground">Use LLM to improve entity extraction</div>
              </div>
              <input
                data-field="model-enabled"
                type="checkbox"
                checked={modelSettings.enabled}
                onChange={(e) => setModelSettings({ ...modelSettings, enabled: e.target.checked })}
                className="w-4 h-4"
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("provider")}</label>
                <Select value={modelSettings.provider} onValueChange={(val: ModelProvider) => {
                  setModelSettings({ ...modelSettings, provider: val, model: "" });
                  setAvailableModels([]);
                  setModelTestState({ loading: false, message: "" });
                }}>
                  <SelectTrigger data-field="model-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ollama">Ollama</SelectItem>
                    <SelectItem value="deepseek">DeepSeek</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="minimax">MiniMax</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Base URL</label>
                <input
                  data-field="model-base-url"
                  type="text"
                  value={modelSettings.baseUrl}
                  onChange={(e) => {
                    setModelSettings({ ...modelSettings, baseUrl: e.target.value, model: "" });
                    setAvailableModels([]);
                    setModelTestState({ loading: false, message: "" });
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">API Key</label>
                <input
                  data-field="model-api-key"
                  type="password"
                  value={modelSettings.apiKey}
                  onChange={(e) => {
                    setModelSettings({ ...modelSettings, apiKey: e.target.value, model: "" });
                    setAvailableModels([]);
                    setModelTestState({ loading: false, message: "" });
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  data-action="test-model-connection"
                  type="button"
                  variant="outline"
                  onClick={handleTestModelConnection}
                  disabled={modelTestState.loading}
                >
                  {modelTestState.loading ? "Testing..." : "测试连接"}
                </Button>
                {modelTestState.message && (
                  <span className={cn(
                    "text-xs",
                    modelTestState.ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  )}>
                    {modelTestState.message}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("modelName")}</label>
                <Select value={modelSettings.model} onValueChange={(value) => setModelSettings({ ...modelSettings, model: value })}>
                  <SelectTrigger data-field="model-name-select">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model} value={model}>{model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Custom Model Name</label>
                <input
                  data-field="custom-model-name"
                  type="text"
                  value={modelSettings.model}
                  onChange={(e) => setModelSettings({ ...modelSettings, model: e.target.value })}
                  placeholder="Enter a model name manually"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent data-section="settings-advanced" value="advanced" className="space-y-6">
            <div data-section="embedding-settings-header" className="space-y-1">
              <div className="text-sm font-semibold">{t("embedding")}</div>
              <div className="text-xs text-muted-foreground">{t("embeddingDescription")}</div>
            </div>

            <div data-setting="embedding" className="flex items-center justify-between p-4 rounded-xl border bg-muted/20">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{t("enableEmbedding")}</div>
                <div className="text-xs text-muted-foreground">
                  {embeddingSettings.enabled ? embeddingProviderLabel(embeddingSettings.provider) : "Graph and keyword retrieval only"}
                </div>
              </div>
              <input
                data-field="embedding-enabled"
                type="checkbox"
                checked={embeddingSettings.enabled}
                onChange={(e) => setEmbeddingSettings({ ...embeddingSettings, enabled: e.target.checked })}
                className="w-4 h-4"
              />
            </div>

            {embeddingSettings.enabled && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("embeddingProvider")}</label>
                  <Select value={embeddingSettings.provider} onValueChange={(value: EmbeddingProvider) => {
                    setEmbeddingSettings({
                      ...embeddingSettings,
                      provider: value,
                      ...defaultEmbeddingSettingsForProvider(value)
                    });
                  }}>
                    <SelectTrigger data-field="embedding-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ollama">Ollama</SelectItem>
                      <SelectItem value="dashscope">Alibaba DashScope</SelectItem>
                      <SelectItem value="zhipu">Zhipu AI</SelectItem>
                      <SelectItem value="baidu">Baidu Qianfan</SelectItem>
                      <SelectItem value="minimax">MiniMax</SelectItem>
                      <SelectItem value="custom">OpenAI-compatible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Base URL</label>
                  <input
                    data-field="embedding-base-url"
                    type="text"
                    value={embeddingSettings.baseUrl}
                    onChange={(e) => setEmbeddingSettings({ ...embeddingSettings, baseUrl: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                {embeddingSettings.provider !== "ollama" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">API Key</label>
                    <input
                      data-field="embedding-api-key"
                      type="password"
                      value={embeddingSettings.apiKey}
                      onChange={(e) => setEmbeddingSettings({ ...embeddingSettings, apiKey: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                )}

                {embeddingSettings.provider === "minimax" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("groupId")}</label>
                    <input
                      data-field="embedding-group-id"
                      type="text"
                      value={embeddingSettings.groupId}
                      onChange={(e) => setEmbeddingSettings({ ...embeddingSettings, groupId: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("embeddingModel")}</label>
                  <input
                    data-field="embedding-model"
                    type="text"
                    value={embeddingSettings.model}
                    onChange={(e) => setEmbeddingSettings({ ...embeddingSettings, model: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("dimensions")}</label>
                  <input
                    data-field="embedding-dimensions"
                    type="number"
                    min={1}
                    value={embeddingSettings.dimensions}
                    onChange={(e) => setEmbeddingSettings({ ...embeddingSettings, dimensions: Number(e.target.value) || 0 })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 mt-6">
          <Button data-action="cancel-settings" variant="ghost" onClick={() => setIsSettingsOpen(false)}>{t("cancel")}</Button>
          <Button data-action="save-settings" onClick={handleSaveSettings}>{t("save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
