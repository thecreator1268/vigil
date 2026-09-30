// AUTO-GENERATED from openapi.yaml by scripts/generate.mjs — do not edit.
/* eslint-disable */
export type paths = {
    "/v1/checkins": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sync a check-in that is already durable on the device.
         * @description Idempotent on `id` — re-sending an already-synced check-in returns 202
         *     with the stored `syncState`. Check-ins are append-only and immutable.
         */
        post: operations["submitCheckIn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/checkins/{id}/free-text": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * The person erases the words they wrote in a check-in (empowerment).
         * @description Irreversibly removes the stored free text; the structured answers and
         *     scores remain. Idempotent. Only the owning person may call this.
         */
        delete: operations["deleteCheckInFreeText"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/victims/{id}/checkins": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** What the person told us, most recent first (counselor view). */
        get: operations["listVictimCheckIns"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/victims/{id}/trend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getVictimTrend"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/scoring-config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Current versioned scoring config (weights + thresholds).
         * @description Devices cache this and stamp every check-in with `configVersion`.
         */
        get: operations["getScoringConfig"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/alerts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listAlerts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/alerts/{id}/acknowledge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["acknowledgeAlert"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/reminders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listReminders"];
        put?: never;
        /** Create or update a reminder (server-authoritative updatedAt, last-write-wins). */
        post: operations["upsertReminder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/consent": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Current effective consent per scope (latest ledger entry wins). */
        get: operations["listConsent"];
        put?: never;
        /** Append an entry to the versioned consent ledger. */
        post: operations["recordConsent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/victims/{id}/case-links": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listCaseLinks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/rollups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Anonymized regional aggregate (k-anonymity suppressed below cohort 5). */
        get: operations["getAdminRollups"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type webhooks = Record<string, never>;
export type components = {
    schemas: {
        Error: {
            error: string;
            message: string;
        };
        /** @description Pseudonymous identifier. Never a name, phone number or case number. */
        VictimId: string;
        /** @description Unix epoch milliseconds */
        Timestamp: number;
        /** @enum {string} */
        Severity: "urgent" | "elevated";
        /** @enum {string} */
        AlertStatus: "open" | "acknowledged" | "resolved";
        /** @enum {string} */
        SignalName: "self_report" | "sentiment" | "engagement" | "voice" | "crisis_scan";
        /** @enum {string} */
        Channel: "app" | "ivrs" | "sms";
        /**
         * @description Wellbeing-oriented signal values in [-1, 1] (0 = neutral) exactly as
         *     they entered the composite formula, so the trend service can recompute.
         */
        SignalTerms: {
            selfReport: number | null;
            sentiment: number | null;
            engagement: number | null;
            voice: number | null;
        };
        CrisisMatch: {
            listVersion: string;
            matchedPhraseIds: string[];
            categories: ("self_harm" | "threat_to_safety")[];
        };
        CheckInSubmission: {
            /** Format: uuid */
            id: string;
            victimId: components["schemas"]["VictimId"];
            createdAt: components["schemas"]["Timestamp"];
            /** @description questionId → Likert answer 0..4. Skipped questions are simply absent. */
            selfReport: {
                [key: string]: number;
            };
            /** @description Only present with consent scope `share-free-text`, or on the crisis fast-path. */
            freeText?: string;
            sentimentScore?: number | null;
            voiceFeatures?: null | {
                pitchVar: number;
                rms: number;
            };
            crisisFlag: boolean;
            crisis?: null | components["schemas"]["CrisisMatch"];
            compositeScore: number;
            signalTerms: components["schemas"]["SignalTerms"];
            responseLatencyMs?: number | null;
            configVersion: number;
            channel: components["schemas"]["Channel"];
            /** @description True when sent by the crisis fast-path queue. */
            fastPath: boolean;
            region?: string;
        };
        CheckInAccepted: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            syncState: "synced" | "crisis-synced";
        };
        CheckInSummary: {
            /** Format: uuid */
            id: string;
            createdAt: components["schemas"]["Timestamp"];
            selfReport: {
                [key: string]: number;
            };
            /** @description Decrypted free text, only when the person consented to share it or it arrived on the crisis fast-path. */
            sharedText?: string | null;
            crisisFlag: boolean;
            channel: components["schemas"]["Channel"];
        };
        Baseline: {
            mean: number;
            stddev: number;
            windowSize: number;
            /** @description False until the minimum number of check-ins exists; no trend alert can fire before then. */
            sufficient: boolean;
        };
        TrendPoint: {
            at: components["schemas"]["Timestamp"];
            compositeScore: number;
        };
        TrendResponse: {
            points: components["schemas"]["TrendPoint"][];
            baseline: null | components["schemas"]["Baseline"];
        };
        ScoringConfig: {
            version: number;
            weights: {
                selfReport: number;
                sentiment: number;
                engagement: number;
                voice: number;
            };
            /** @description T — distressed direction is negative */
            zThreshold: number;
            urgentZThreshold: number;
            /** @description Magnitude; a slope below -slopeThreshold is distressed. */
            slopeThreshold: number;
            baselineWindow: number;
            minBaseline: number;
            slopeWindow: number;
            sigmaFloor: number;
            involvementThreshold: number;
        };
        Alert: {
            /** Format: uuid */
            id: string;
            victimId: components["schemas"]["VictimId"];
            severity: components["schemas"]["Severity"];
            signals_involved: components["schemas"]["SignalName"][];
            reason_text: string;
            /** @description Never exposed. Always null by contract. */
            raw_score: null;
            status: components["schemas"]["AlertStatus"];
            /** @enum {string} */
            source: "trend" | "crisis";
            configVersion: number;
            createdAt: components["schemas"]["Timestamp"];
            acknowledgedAt: null | components["schemas"]["Timestamp"];
            acknowledgedBy: string | null;
        };
        /** @enum {string} */
        ReminderType: "hearing" | "compensation" | "checkin";
        ReminderInput: {
            /** Format: uuid */
            id: string;
            victimId: components["schemas"]["VictimId"];
            dueAt: components["schemas"]["Timestamp"];
            type: components["schemas"]["ReminderType"];
            note: string;
        };
        Reminder: {
            /** Format: uuid */
            id: string;
            victimId: components["schemas"]["VictimId"];
            dueAt: components["schemas"]["Timestamp"];
            type: components["schemas"]["ReminderType"];
            note: string;
            updatedAt: components["schemas"]["Timestamp"];
        };
        /** @enum {string} */
        ConsentScope: "share-free-text" | "share-voice-features" | "voice-transcription" | "counselor-contact" | "case-linking";
        ConsentInput: {
            /** Format: uuid */
            id: string;
            victimId: components["schemas"]["VictimId"];
            scope: components["schemas"]["ConsentScope"];
            granted: boolean;
            at: components["schemas"]["Timestamp"];
        };
        ConsentRecord: {
            /** Format: uuid */
            id: string;
            victimId: components["schemas"]["VictimId"];
            scope: components["schemas"]["ConsentScope"];
            granted: boolean;
            at: components["schemas"]["Timestamp"];
            updatedAt: components["schemas"]["Timestamp"];
            /** @description Monotonic per victim. */
            ledgerVersion: number;
        };
        CaseLink: {
            /** Format: uuid */
            id: string;
            victimId: components["schemas"]["VictimId"];
            externalSystem: string;
            externalCaseRef: string;
            /** @enum {string} */
            stage: "fir_registered" | "investigation" | "chargesheet" | "trial" | "disposed";
            nextHearingAt: null | components["schemas"]["Timestamp"];
            /** @enum {string} */
            compensationStatus: "not_applied" | "applied" | "sanctioned" | "disbursed";
            updatedAt: components["schemas"]["Timestamp"];
        };
        AnonymizedAggregate: {
            region: string;
            periodDays: number;
            /** @description True when the cohort is below the k-anonymity threshold; all counts are then null. */
            suppressed: boolean;
            cohortSize: number | null;
            checkInCount: number | null;
            alerts: null | {
                urgent: number;
                elevated: number;
                acknowledgedWithin24hPct: number | null;
            };
            weeklyCheckIns: {
                weekStart: components["schemas"]["Timestamp"];
                count: number;
            }[];
        };
    };
    responses: {
        /** @description Request failed validation */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Missing or invalid token */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Token scope not permitted for this operation */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Not found */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: {
        VictimIdPath: components["schemas"]["VictimId"];
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
    submitCheckIn: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CheckInSubmission"];
            };
        };
        responses: {
            /** @description Accepted */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CheckInAccepted"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    deleteCheckInFreeText: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Erased (or there was nothing to erase) */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    listVictimCheckIns: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path: {
                id: components["parameters"]["VictimIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        checkIns: components["schemas"]["CheckInSummary"][];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    getVictimTrend: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["VictimIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrendResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    getScoringConfig: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScoringConfig"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    listAlerts: {
        parameters: {
            query?: {
                status?: components["schemas"]["AlertStatus"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Severity-sorted (urgent first), newest first within severity. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alerts: components["schemas"]["Alert"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    acknowledgeAlert: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK (idempotent) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alert: components["schemas"]["Alert"];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    listReminders: {
        parameters: {
            query: {
                victimId: components["schemas"]["VictimId"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK, ordered by dueAt ascending */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        reminders: components["schemas"]["Reminder"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    upsertReminder: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReminderInput"];
            };
        };
        responses: {
            /** @description Created or updated */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        reminder: components["schemas"]["Reminder"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    listConsent: {
        parameters: {
            query: {
                victimId: components["schemas"]["VictimId"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        records: components["schemas"]["ConsentRecord"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    recordConsent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsentInput"];
            };
        };
        responses: {
            /** @description Recorded */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        record: components["schemas"]["ConsentRecord"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    listCaseLinks: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["VictimIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        caseLinks: components["schemas"]["CaseLink"][];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    getAdminRollups: {
        parameters: {
            query: {
                region: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        anonymizedAggregate: components["schemas"]["AnonymizedAggregate"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
}
