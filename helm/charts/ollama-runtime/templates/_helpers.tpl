{{- define "ollama-runtime.name" -}}
ollama-runtime
{{- end -}}

{{- define "ollama-runtime.labels" -}}
app.kubernetes.io/name: {{ include "ollama-runtime.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
