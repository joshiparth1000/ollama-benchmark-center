{{- define "obc.name" -}}
ollama-benchmark-center
{{- end -}}

{{- define "obc.labels" -}}
app.kubernetes.io/name: {{ include "obc.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
