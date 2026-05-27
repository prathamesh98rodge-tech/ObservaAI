{{- define "observaai.name" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "observaai.gateway.fullname" -}}
{{- printf "%s-gateway" (include "observaai.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "observaai.dashboard.fullname" -}}
{{- printf "%s-dashboard" (include "observaai.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "observaai.postgres.fullname" -}}
{{- printf "%s-postgres" (include "observaai.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "observaai.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* Resolve DATABASE_URL: external override wins; otherwise build from bundled postgres creds */}}
{{- define "observaai.databaseUrl" -}}
{{- if .Values.externalDatabaseUrl }}
{{- .Values.externalDatabaseUrl }}
{{- else }}
{{- printf "postgresql+asyncpg://%s:%s@%s:%v/%s" .Values.postgres.credentials.user .Values.postgres.credentials.password (include "observaai.postgres.fullname" .) (.Values.postgres.port | int) .Values.postgres.credentials.database }}
{{- end }}
{{- end }}
