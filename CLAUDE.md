@AGENTS.md

# Claude Code 向けの補足
- 作業を始める前に `docs/supabase-migration.md` の該当フェーズを読み、終わりの条件を確認する。
- 1つのプルリクエストは1つのフェーズの一部に絞る。
- 業務ルールで迷ったら、推測せず `legacy/Code.gs` の該当関数を読む（判定は `judgeDate`・`resolvePlan_`・`noticeOnTime_`、罰は `computePenalty_`・`syncAutoPenalties_`、参加登録は `upcomingJoins_`・`handleJoin_`、代替わりは `changeGenerationMenu`・`promoteGradesMenu`）。
