# Graph Report - .  (2026-08-02)

## Corpus Check
- 323 files · ~256,325 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2211 nodes · 6862 edges · 126 communities (103 shown, 23 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 71 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- AI Measurement Report
- Multi Game E2E
- Perf Report
- Risk Components
- Metrics Components
- Transitions Components
- Turn Action
- Multiplayer Client Group
- Guards Components
- Create Game Store Types
- Victory Components
- Scripts Components
- Jump Components
- Create Initial State
- Perf Ab
- Board Components Group
- Text Components
- Root Search
- Use Game Store
- With Rule Defaults
- AI Position Buckets Report
- Hash Position
- Model Types
- Factories Components
- Compiler Options
- Action Handlers
- Use Is Mobile Viewport
- Reducer Components
- Dev Dependencies
- Domain Index
- Move Ordering
- AI Index
- Button Components
- Create Game Store AI Test
- Types Session
- Persistence Components
- Catalog Components
- Participation Heuristics
- Multiplayer Components
- Accumulator Components
- Strategy Components
- Run Git Report Compare
- Advanced Metrics
- Participation Components
- App Components
- Turn Summary Strip
- Multiplayer Client Group
- Telemetry Components
- Match Room Group
- Telemetry Contracts
- Board Components Group
- Runtime Components
- Get Legal Actions
- CNN Board Encoding
- Train Policy Value
- AI Crossplay Report
- AI Stage Variety Report
- Coordinates Components
- Codec Components
- Six Stack Plan Potential
- Match Room Group
- Jump Chain Validation
- Undo Redo Cursors
- Behavior Components
- Rules Session Section
- Persistence Hydration
- AI Selfplay Dataset
- Action Space
- Queue Components
- Worker Index
- AI Variety Report
- Guidance Components
- Multiplayer Index
- Device Profile
- Immutable Board Updates
- Draw Trap Replay
- Strategic Evaluation Heatmap
- Legal Action Types
- Negamax Score Inversion
- Dependencies Components
- Spatial Score Analysis
- Hybrid AI Search
- Runtime Architecture
- Package Components
- Check Markdown Links
- Multiplayer E2E
- Search Depth Evaluation
- Favicon Svg
- AI Measurement Protocol
- Policy Value Training
- PWA App Icon Group
- Playwright Skill Loader
- Session Archive
- YOUI App Icon
- Maskable PWA Icon
- GPU Probe Worker
- Durable Object
- Cloudflare Workers Types
- PWA Infrastructure
- Canonical Rulebook
- Playwright Components
- Prettier Components
- Sass Components
- Testing Library User Event
- Code Components
- Types React Dom
- Vite Components
- Vitest Components
- Participation Score
- UI Projection Boundary
- Vite Env D
- Two Tier Persistence
- Jumped Cell
- Source Cell
- Target Cell
- Apple Touch Icon With Abstract
- PWA App Icon Group

## God Nodes (most connected - your core abstractions)
1. `createInitialState()` - 65 edges
2. `hashPosition()` - 59 edges
3. `chooseComputerAction()` - 54 edges
4. `getLegalActions()` - 52 edges
5. `allCoords()` - 51 edges
6. `TurnAction` - 48 edges
7. `text()` - 48 edges
8. `useGameStore()` - 43 edges
9. `withRuleDefaults()` - 43 edges
10. `MultiplayerClient` - 42 edges

## Surprising Connections (you probably didn't know these)
- `summarizeCell()` --calls--> `summarizeAdvancedTraceMetrics()`  [EXTRACTED]
  scripts/ai-crossplay.report.ts → src/ai/test/advancedMetrics.ts
- `summarizeCell()` --calls--> `summarizeAiVariety()`  [EXTRACTED]
  scripts/ai-crossplay.report.ts → src/ai/test/metrics.ts
- `runDifficultySeries()` --calls--> `runAiGameTrace()`  [EXTRACTED]
  scripts/ai-crossplay.report.ts → src/ai/test/metrics.ts
- `runDifficultySeries()` --calls--> `withRuleDefaults()`  [EXTRACTED]
  scripts/ai-crossplay.report.ts → src/domain/model/ruleConfig.ts
- `runPersonaSeries()` --calls--> `runAiGameTrace()`  [EXTRACTED]
  scripts/ai-crossplay.report.ts → src/ai/test/metrics.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **State Encoding Material and Context Groups** — docs_img_16ch_cnn_map_perspective_aligned_state_encoding, docs_img_16ch_cnn_map_board_context, docs_img_16ch_cnn_map_opponent_material, docs_img_16ch_cnn_map_own_material [EXTRACTED 1.00]
- **Jump Chain Validation Sequence** — docs_img_jump_loop_start_c3, docs_img_jump_loop_landing_e5, docs_img_jump_loop_landing_c3_repeat, docs_img_jump_loop_candidate_landing_e1, docs_img_jump_loop_segment_1_valid_jump, docs_img_jump_loop_segment_2_valid_jump, docs_img_jump_loop_segment_3_prohibited [EXTRACTED 1.00]
- **Checker Identity and Landing Square Validation Rules** — docs_img_jump_loop_jump_chain_validation, docs_img_jump_loop_checker_identity, docs_img_jump_loop_landing_square, docs_img_jump_loop_allowed_revisit_landing_squares, docs_img_jump_loop_forbidden_same_checker_identity_twice [EXTRACTED 1.00]
- **Legal Actions Illustrated in Board Diagram** — docs_img_legal_actions_manualunfreeze, docs_img_legal_actions_jumpsequence, docs_img_legal_actions_clim_bone, docs_img_legal_actions_movesingletoempty, docs_img_legal_actions_splitonefromstack, docs_img_legal_actions_splittwofromstack, docs_img_legal_actions_friendllystacktransfer [EXTRACTED 1.00]
- **Participation Score Reward and Penalty Mechanism** — docs_img_participation_anti_oscillation_participation_score, docs_img_participation_anti_oscillation_rewards, docs_img_participation_anti_oscillation_frontier_width, docs_img_participation_anti_oscillation_fresh_activation, docs_img_participation_anti_oscillation_penalties, docs_img_participation_anti_oscillation_hot_region_concentration, docs_img_participation_anti_oscillation_same_family_streaks [EXTRACTED 1.00]
- **Narrow Oscillation Pattern** — docs_img_participation_anti_oscillation_narrow_oscillation, docs_img_participation_anti_oscillation_low_participation, docs_img_participation_anti_oscillation_family_reuse, docs_img_participation_anti_oscillation_region_reuse, docs_img_participation_anti_oscillation_limited_move_sources, docs_img_participation_anti_oscillation_localized_board_zones, docs_img_participation_anti_oscillation_potential_stagnation, docs_img_participation_anti_oscillation_limited_frontier_expansion [EXTRACTED 1.00]
- **Broad Participation Pattern** — docs_img_participation_anti_oscillation_broad_participation, docs_img_participation_anti_oscillation_high_participation, docs_img_participation_anti_oscillation_varied_piece_types, docs_img_participation_anti_oscillation_multiple_board_quadrants, docs_img_participation_anti_oscillation_expansive_search_zone, docs_img_participation_anti_oscillation_continuous_frontier_growth, docs_img_participation_anti_oscillation_fresh_activation [EXTRACTED 1.00]
- **Two-tier boot and recovery flow** — docs_img_persistence_hydration_layers_localstorage, docs_img_persistence_hydration_layers_application, docs_img_persistence_hydration_layers_indexeddb, docs_img_persistence_hydration_layers_full_archive_recovery [EXTRACTED 1.00]
- **Stale archive protection guard** — docs_img_persistence_hydration_layers_application, docs_img_persistence_hydration_layers_user_mutated_live_state, docs_img_persistence_hydration_layers_allowed_state_update, docs_img_persistence_hydration_layers_stale_archive_dropped [EXTRACTED 1.00]
- **Strategic Evaluation Patterns** — docs_img_score_heatmap_advanced_well_supported_checker_in_strong_lane, docs_img_score_heatmap_lane_openness_strategic_advantage, docs_img_score_heatmap_front_row_build, docs_img_score_heatmap_overextended_trapped_liability, docs_img_score_heatmap_frozen_critical_liability_structural_debt, docs_img_score_heatmap_buried_debt [EXTRACTED 1.00]
- **Search-depth Evaluation with Quiescence Extension** — docs_img_search_score_depth_search_depth, docs_img_search_score_depth_board_evaluation_score, docs_img_search_score_depth_arbitrary_maxdepth_cutoff, docs_img_search_score_depth_quiescence_tactical_extension [EXTRACTED 1.00]
- **Spatial Score Components** — docs_img_spatial_score_analysis_lane_openness, docs_img_spatial_score_analysis_jump_lanes, docs_img_spatial_score_analysis_front_row_controlled_height, docs_img_spatial_score_analysis_buried_debt, docs_img_spatial_score_analysis_frozen_critical_singles, docs_img_spatial_score_analysis_transport_value [EXTRACTED 1.00]
- **Home-Plan Potential Component Set** — docs_img_strategic_advantage_homeplanpotential, docs_img_strategic_advantage_home_singles, docs_img_strategic_advantage_lane_openness, docs_img_strategic_advantage_distance_to_home [EXTRACTED 1.00]
- **Six-Stack Plan Potential Component Set** — docs_img_strategic_advantage_sixstackplanpotential, docs_img_strategic_advantage_front_row_controlled_height, docs_img_strategic_advantage_owned_two_stacks, docs_img_strategic_advantage_full_stacks [EXTRACTED 1.00]
- **Competing Evaluation Terms for the 6×6 Game** — docs_img_strategic_advantage_6x6_abstract_strategy_stacking_game, docs_img_strategic_advantage_homeplanpotential, docs_img_strategic_advantage_sixstackplanpotential [EXTRACTED 1.00]
- **Identity-Preserving Board Update** — docs_img_structural_sharing_board_diff_previous_board, docs_img_structural_sharing_board_diff_next_board, docs_img_structural_sharing_board_diff_safe_immutable_api, docs_img_structural_sharing_board_diff_structural_sharing, docs_img_structural_sharing_board_diff_untouched_cells_preserve_identity [EXTRACTED 1.00]
- **Rejected Deep Clone Strategy** — docs_img_structural_sharing_board_diff_rejected, docs_img_structural_sharing_board_diff_naive_deep_clone, docs_img_structural_sharing_board_diff_every_cell_duplicated [EXTRACTED 1.00]
- **Undo/Redo cursor chronology flow** — docs_img_undo_redo_cursor_chronology_past_undoframes, docs_img_undo_redo_cursor_chronology_current_visible_position, docs_img_undo_redo_cursor_chronology_future_undoframes, docs_img_undo_redo_cursor_chronology_undo, docs_img_undo_redo_cursor_chronology_redo, docs_img_undo_redo_cursor_chronology_canonical_turnlog [EXTRACTED 1.00]
- **Negamax Score Inversion Across a Move** — docs_img_zero_sum_negamax_scale_zero_sum_game, docs_img_zero_sum_negamax_scale_negamax_transformation, docs_img_zero_sum_negamax_scale_parent_score, docs_img_zero_sum_negamax_scale_child_score [EXTRACTED 1.00]
- **Layered Favicon Composition** — public_favicon_favicon_svg, public_favicon_rounded_beige_background, public_favicon_dark_inner_square, public_favicon_grid, public_favicon_white_circle, public_favicon_orange_circle [INFERRED 0.95]
- **Board-Game App Icon Composition** — public_pwa_512x512_image, public_pwa_512x512_grid_board, public_pwa_512x512_circular_game_pieces [INFERRED 0.85]

## Communities (126 total, 23 thin omitted)

### Community 0 - "AI Measurement Report"
Cohesion: 0.06
Nodes (62): assertComparable(), ComparisonMetric, DecisionSample, main(), markdown(), MeasurementReport, pairedValues(), parseArgs() (+54 more)

### Community 1 - "Multi Game E2E"
Cohesion: 0.07
Nodes (48): assert(), assertNoHorizontalOverflow(), clickUnique(), createDrawInterstitialSession(), createNearDoubleFinishSession(), importSession(), main(), performAction() (+40 more)

### Community 2 - "Perf Report"
Cohesion: 0.07
Nodes (53): buildHtml(), C, defaultInput, defaultOutput, esc(), fmtVal(), generateCharts(), main() (+45 more)

### Community 3 - "Risk Components"
Cohesion: 0.08
Nodes (52): evaluateState(), evaluateStructureState(), EvaluationOptions, getOpponent(), resolvePerfBundle(), getOpponent(), getParticipationScore(), buildProgressSnapshot() (+44 more)

### Community 4 - "Metrics Components"
Cohesion: 0.09
Nodes (49): actionKey(), AiVarietyBaseline, AiVarietyTargetBands, average(), BehaviorDescriptor, behaviorSpaceBin(), behaviorVector(), bucketIndex() (+41 more)

### Community 5 - "Transitions Components"
Cohesion: 0.12
Nodes (37): createFinishingTelemetryTracker(), createGameplayActions(), getComputerUndoTarget(), getHistoryStepData(), getTurnSpans(), getRuleConfigForNewMatch(), isComputerMatch(), isComputerTurn() (+29 more)

### Community 6 - "Turn Action"
Cohesion: 0.16
Nodes (35): AI_MODEL_ACTION_COUNT, OrderedAction, orderMoves(), ParticipationState, createSearchPerfCache(), requirePositiveInteger(), ResolvedSearchBudget, resolveSearchBudget() (+27 more)

### Community 7 - "Multiplayer Client Group"
Cohesion: 0.14
Nodes (9): canUseDirectPath(), checkpointKey(), isRecord(), MultiplayerCallbacks, MultiplayerClient, parseInvite(), responseMessage(), ClientMessage (+1 more)

### Community 8 - "Guards Components"
Cohesion: 0.18
Nodes (38): assertLegacySession(), assertSessionV2(), assertSessionV3(), assertSessionV4(), assertSessionV5(), deserializeSession(), migrateSession(), assertAction() (+30 more)

### Community 9 - "Create Game Store Types"
Cohesion: 0.09
Nodes (34): AI_AUTO_RETRY_LIMIT, AI_COLD_START_BUFFER_MS, AI_SLOW_DEVICE_BUFFER_MS, AiControllerOptions, createAiController(), StoreSetter, createDerivationCache(), ruleConfigKey() (+26 more)

### Community 10 - "Victory Components"
Cohesion: 0.13
Nodes (34): AI_MODEL_PLANE_COUNT, encodeStateForModel(), setPlaneValue(), getFrontierWidth(), getFinishingProgress(), countCheckersForPlayer(), isFullStackOwnedByPlayer(), BOARD_COLUMNS (+26 more)

### Community 11 - "Scripts Components"
Cohesion: 0.05
Nodes (37): scripts, ai:crossplay, ai:crossplay:compare, ai:loop-benchmark, ai:loop-benchmark:compare, ai:measure, ai:measure:compare, ai:measure:compare-files (+29 more)

### Community 12 - "Jump Components"
Cohesion: 0.14
Nodes (34): getFreezeSwingBonus(), countDirectionalOpenness(), getDerivedFreezeSwingBonus(), cloneBoardStructure(), getTopChecker(), setSingleCheckerFrozen(), directionDeltaIndex(), getAdjacentCoord() (+26 more)

### Community 13 - "Create Initial State"
Cohesion: 0.10
Nodes (27): AiScenarioDefinition, buildScenarioState(), createContinuationScenarioState(), buildLateGameAiFixtures(), buildRootCacheBenchmark(), cellButtonLabel(), LateGameAiFixture, PerfMetric (+19 more)

### Community 14 - "Perf Ab"
Cohesion: 0.15
Nodes (32): buildMarkdown(), cleanupWorkspace(), collectReport(), addBrowserMetrics(), addMetric(), assertCompatibleReports(), assertFiniteSamples(), bootstrapMedianInterval() (+24 more)

### Community 15 - "Board Components Group"
Cohesion: 0.10
Nodes (31): CHECKER_H1, CHECKER_H2, COORD_TO_IDX, COORDS, getCheckerHashPair(), hashCheckerIdFallback(), hashLegacyStateKey(), LEGACY_COORD_H1 (+23 more)

### Community 16 - "Text Components"
Cohesion: 0.14
Nodes (20): formatHistorySummary(), text(), GameControlPanel(), HistorySection(), HistoryState, difficultyLabel(), MatchSetupPanel(), MatchSetupPanelProps (+12 more)

### Community 17 - "Root Search"
Cohesion: 0.11
Nodes (32): measureRootOrderingLoop(), resolveRootOrderingBenchmarkIterations(), buildParticipationState(), reportSearchBudget(), buildCandidates(), chooseFinishingAction(), FinishingLine, FinishingPlanNode (+24 more)

### Community 18 - "Use Game Store"
Cohesion: 0.11
Nodes (25): AppOverlays(), GameResultModal, loadGameResultModal(), loadTurnOverlay(), preloadAppOverlays(), TurnOverlay, CreateGameStoreOptions, GameStoreContext (+17 more)

### Community 19 - "With Rule Defaults"
Cohesion: 0.15
Nodes (26): RuleToggleDescriptor, withRuleDefaults(), Coord, RuleConfig, getOpponent(), incrementPositionCount(), nextStateSeed(), playerHasLegalAction() (+18 more)

### Community 20 - "AI Position Buckets Report"
Cohesion: 0.10
Nodes (29): buildMarkdown(), JSON_OUTPUT, LoopBenchmarkRow, main(), MARKDOWN_OUTPUT, OUTPUT_DIR, parseArg(), BucketRow (+21 more)

### Community 21 - "Hash Position"
Cohesion: 0.14
Nodes (23): AI_DIFFICULTY_PRESETS, compareTiebreakTuple(), findSaferAlternative(), getRecurrenceRisk(), getTiebreakTuple(), TODO: The draw-trap fixture was recorded under old rules that allowed cross-…, PARITY_RULE_CONFIG, TODO: 'easy late draw trap' parity case removed — the draw-trap fixture was… (+15 more)

### Community 22 - "Model Types"
Cohesion: 0.09
Nodes (26): ActiveFinishingTelemetry, encodeTelemetryBoardSnapshot(), FinishingGoal, FinishingMoveTelemetry, finishingPlayer(), FinishingProgress, fnv1a(), positionFingerprint() (+18 more)

### Community 23 - "Factories Components"
Cohesion: 0.20
Nodes (15): buildSelectableBaseline(), createOpponentThreatState(), reportedFinishingState(), createSelfUndoMotifState(), createWhiteWinningState(), SERIES_SETTINGS, createCell(), createEmptyBoard() (+7 more)

### Community 24 - "Compiler Options"
Cohesion: 0.07
Nodes (29): @cloudflare/workers-types, DOM, DOM.Iterable, ES2022, eslint.config.js, src, vite.config.ts, vitest/globals (+21 more)

### Community 25 - "Action Handlers"
Cohesion: 0.18
Nodes (27): buildEmptyCellCount(), getEmptyCellCount(), getCellHeight(), getController(), isEmptyCell(), isSingleChecker(), isStack(), ValidationResult (+19 more)

### Community 26 - "Use Is Mobile Viewport"
Cohesion: 0.12
Nodes (23): getGlossaryEntry(), GLOSSARY, GlossaryEntry, GlossaryTermId, createViewportQueryStore(), getQuery(), getSnapshot(), getViewportQueryStore() (+15 more)

### Community 27 - "Reducer Components"
Cohesion: 0.12
Nodes (27): CreateMatchRequest, CreateMatchResponse, CreateSessionRequest, CreateSessionResponse, MatchApplyResult, MatchCommand, MatchCommandRejectionReason, MatchSnapshot (+19 more)

### Community 28 - "Dev Dependencies"
Cohesion: 0.07
Nodes (29): eslint, @eslint/js, fake-indexeddb, globals, jsdom, devDependencies, eslint, @eslint/js (+21 more)

### Community 29 - "Domain Index"
Cohesion: 0.12
Nodes (23): GameStoreProvider(), getTurnActionEndpoints(), TurnActionEndpoints, RULE_DEFAULTS, FriendlyStackTransferAction, MoveSingleToEmptyAction, buildEvents(), EngineCommand (+15 more)

### Community 30 - "Move Ordering"
Cohesion: 0.12
Nodes (27): getBehaviorActionBias(), clampScore(), finalizeOrderedActions(), getDynamicScore(), getRepeatedPositionCountByKey(), getSourceTarget(), growsFrontRowStack(), improvesHomeField() (+19 more)

### Community 31 - "AI Index"
Cohesion: 0.15
Nodes (18): toRootCandidate(), AiDifficultyPreset, AiFallbackKind, AiModelGuidance, AiRiskMode, AiRootCandidate, AiSearchBudget, AiSearchBudgetReport (+10 more)

### Community 32 - "Button Components"
Cohesion: 0.11
Nodes (17): LanguageSwitch(), LanguageSwitchProps, TurnOverlay(), formatPassOverlayLabel(), cx(), flushParagraph(), INSTRUCTION_BLOCKS, InstructionBlock (+9 more)

### Community 33 - "Create Game Store AI Test"
Cohesion: 0.19
Nodes (17): AI_SEQUENCE_STEP_REVEAL_MS, createGameStore(), ONLINE_MATCH, createSeriesSession(), ArchiveRecord, createAiResult(), createDeferred(), createHistorySession() (+9 more)

### Community 34 - "Types Session"
Cohesion: 0.11
Nodes (21): AI_WATCHDOG_BUFFER_MS, DEFAULT_PREFERENCES, LEGACY_RULE_DEFAULTS, buildSession(), buildSessionFromSlices(), getDefaultSession(), getSessionSlices(), SessionSlices (+13 more)

### Community 35 - "Persistence Components"
Cohesion: 0.14
Nodes (22): clearLegacySessionKeys(), getInitialPersistenceState(), hasLegacyRuleDefaults(), isUntouchedSession(), migrateLegacyRuleDefaults(), persistSessionSnapshot(), openDatabase(), StoredArchiveRecord (+14 more)

### Community 36 - "Catalog Components"
Cohesion: 0.14
Nodes (19): PwaStatusBanner(), PwaStatusBannerProps, INTERACTION_COPY, InteractionCopy, MISC_COPY, MiscCopy, RESULT_TITLE_COPY, ResultTitleCopy (+11 more)

### Community 37 - "Participation Heuristics"
Cohesion: 0.08
Nodes (25): Broad Participation, Continuous Frontier Growth, Participation Anti-Oscillation Diagram, Expansive Search Zone, Family Reuse, Forcing Line, Fresh Activation, Frontier Width (+17 more)

### Community 38 - "Multiplayer Components"
Cohesion: 0.19
Nodes (21): createCapability(), InitializeMatchInput, cookieValue(), createMatch(), createSession(), enforceRateLimit(), handleMultiplayerRequest(), isCreateMatchRequest() (+13 more)

### Community 39 - "Accumulator Components"
Cohesion: 0.17
Nodes (16): AccumulatorSnapshot, canRecordMetric(), createId(), fnv1a(), isSafeName(), MAX_CONTEXT_EVENTS, MAX_INCIDENTS, MAX_METRICS_PER_SUMMARY (+8 more)

### Community 40 - "Strategy Components"
Cohesion: 0.15
Nodes (22): ActionStrategicProfile, addCellAnalysis(), addStackStructure(), addTag(), analysisCache, buildAnalysis(), buildIntentProfile(), createPlayerAnalysis() (+14 more)

### Community 41 - "Run Git Report Compare"
Cohesion: 0.19
Nodes (19): DEFAULT_AFTER, DEFAULT_BEFORE, DEFAULT_OUTPUT, main(), parseArg(), buildComparisonMarkdown(), flattenNumericLeaves(), formatDelta() (+11 more)

### Community 42 - "Advanced Metrics"
Cohesion: 0.21
Nodes (19): AdvancedTraceSummary, average(), buildRecurrenceMatrix(), collectRunLengths(), computeNormalizedLempelZiv(), computePermutationEntropy(), computeRecurrenceQuantification(), computeSampleEntropy() (+11 more)

### Community 43 - "Participation Components"
Cohesion: 0.15
Nodes (20): ActionParticipationProfile, buildSourceFamily(), createParticipationEntry(), FileBand, getActionSource(), getConcentration(), getFileBand(), getIdleReserveMass() (+12 more)

### Community 44 - "App Components"
Cohesion: 0.16
Nodes (13): App(), GameTab, InstructionsTab, scheduleIdleTask(), SettingsTab, AppHeader(), AppHeaderProps, AppTab (+5 more)

### Community 45 - "Turn Summary Strip"
Cohesion: 0.20
Nodes (16): GameResultModal(), getResultToken(), participantLabel(), describeInteraction(), formatGameResultTitle(), formatTurnBanner(), formatVictory(), playerLabel() (+8 more)

### Community 46 - "Multiplayer Client Group"
Cohesion: 0.10
Nodes (13): createOnlineTurnRecord(), OnlineConnectionStatus, OnlineMatchView, PeerSignal, PendingCommand, ProjectionOptions, socketUrl(), StoredCheckpoint (+5 more)

### Community 47 - "Telemetry Components"
Cohesion: 0.25
Nodes (20): D1DatabaseLike, D1PreparedStatement, D1RunResult, handleTelemetryRequest(), hasOnlyKeys(), isBooleanRecord(), isBoundedString(), isContext() (+12 more)

### Community 48 - "Match Room Group"
Cohesion: 0.14
Nodes (18): AuthoritativeMatchState, CommittedMatchCommand, MatchLifecycle, MAX_INCREMENTAL_COMMANDS, CachedRoom, CapabilityRow, CommandRow, isRecord() (+10 more)

### Community 49 - "Telemetry Contracts"
Cohesion: 0.15
Nodes (15): compactBatch(), createTelemetryClient(), FlushReason, randomId(), serializedSize(), TelemetryClient, TelemetryClientOptions, NOOP_TELEMETRY_SINK (+7 more)

### Community 50 - "Board Components Group"
Cohesion: 0.15
Nodes (11): isOnlineInputLocked(), displayCoords(), Board, BoardProps, DISPLAY_CELLS, BoardCell, BoardCellProps, CheckerStack (+3 more)

### Community 51 - "Runtime Components"
Cohesion: 0.19
Nodes (15): createMemoryTelemetryQueue(), startTelemetry(), telemetry, browserFamily(), browserMajor(), classifyRuntimeContext(), coarseGpuFamily(), cpuBucket() (+7 more)

### Community 52 - "Get Legal Actions"
Cohesion: 0.14
Nodes (8): hasLegalAction(), actionKey(), { createSessionSpy, runSpy }, Tensor, buildActions(), buildMidgameState(), measureSearchThroughput(), getLegalActions()

### Community 53 - "CNN Board Encoding"
Cohesion: 0.12
Nodes (17): 16-Channel CNN Map, Binary or Normalized 0–1 Data for Model Deployment, Board Context, Coordinate C4, Coordinate E3, Opponent Material, Own Material, Perspective-Aligned State Encoding (+9 more)

### Community 54 - "Train Policy Value"
Cohesion: 0.19
Nodes (9): Namespace, Path, collate(), main(), PolicyValueNet, ResidualBlock, Sample, SelfPlayDataset (+1 more)

### Community 55 - "AI Crossplay Report"
Cohesion: 0.19
Nodes (16): buildMarkdown(), buildMatrixReport(), buildMatrixTable(), CellSummary, createForcedProfile(), getPointsForSide(), JSON_OUTPUT, main() (+8 more)

### Community 56 - "AI Stage Variety Report"
Cohesion: 0.18
Nodes (16): buildMarkdown(), classifyMetric(), computeBehaviorStats(), createContinuationStageState(), createEmptyProfileCounts(), JSON_OUTPUT, main(), MARKDOWN_OUTPUT (+8 more)

### Community 57 - "Coordinates Components"
Cohesion: 0.17
Nodes (15): BOARD_ROWS, DIRECTION_VECTORS, ADJACENT_COORDS, ALL_COORDS, COORD_INDEX, coordToIndices(), DIRECTION_BY_DELTA_INDEX, DISPLAY_COORDS (+7 more)

### Community 58 - "Codec Components"
Cohesion: 0.40
Nodes (15): decodeClientMessage(), decodeCreateMatchResponse(), decodeCreateSessionResponse(), decodePeerProposal(), decodeServerMessage(), isAuthoritativeMatchState(), isCommand(), isCommandEnvelope() (+7 more)

### Community 59 - "Six Stack Plan Potential"
Cohesion: 0.18
Nodes (16): 6×6 Abstract Strategy Stacking Game, B1 White Stack of Three, D4 White Trapped Under Black, Distance to Home, E6 White Single, Front-Row Controlled Height, Full Stacks, Home-Row Conversion Progress (+8 more)

### Community 60 - "Match Room Group"
Cohesion: 0.28
Nodes (3): ServerMessage, isParticipant(), MatchRoom

### Community 61 - "Jump Chain Validation"
Cohesion: 0.20
Nodes (15): Allowed: Revisit Landing Squares, Candidate Landing 3: E1, Checker Identity B17, Checker Identity B22, Checker Identity, Forbidden: Jump Same Checker Identity Twice, Jump Chain Validation: Checker Identity vs. Landing Square, Jump Chain Validation (+7 more)

### Community 62 - "Undo Redo Cursors"
Cohesion: 0.20
Nodes (15): Canonical turnLog, Current visible position, Undo/Redo Cursor Chronology, Future UndoFrames, Lightweight cursors, Past UndoFrames, Redo, T1 (+7 more)

### Community 63 - "Behavior Components"
Cohesion: 0.18
Nodes (14): getActionAnchor(), getBehaviorGeometryBias(), getBehaviorStateBias(), getGeometryBand(), getOpponent(), hashSeed(), PROFILE_IDS, getActionParticipationProfile() (+6 more)

### Community 64 - "Rules Session Section"
Cohesion: 0.22
Nodes (7): RULE_TOGGLE_DESCRIPTORS, useDiagnosticsPreference(), ExportImportSection(), checkboxId(), RulesSessionSection(), SettingsPanel(), SettingsTab()

### Community 65 - "Persistence Hydration"
Cohesion: 0.19
Nodes (14): Allowed State Update, Application, ArchiveB, Boot path, Fast local snapshot, full, Full archive recovery, hydrating (+6 more)

### Community 66 - "AI Selfplay Dataset"
Cohesion: 0.25
Nodes (13): createSeededRandom(), DatasetEntry, Difficulty, main(), mirrorAction(), mirrorCoord(), mirrorState(), outcomeValue() (+5 more)

### Community 67 - "Action Space"
Cohesion: 0.22
Nodes (12): ADJACENT_ACTION_KINDS, ADJACENT_KIND_INDEX, adjacentKindIndex(), AI_MODEL_POLICY_TEMPERATURE, COORD_INDEX, coordIndex(), COORDS, DIRECTION_INDEX (+4 more)

### Community 68 - "Queue Components"
Cohesion: 0.24
Nodes (11): createBrowserTelemetryQueue(), createTelemetryQueue(), deleteDatabase(), MAX_QUEUED_BATCHES, MAX_QUEUED_BYTES, openDatabase(), QueueRecord, requestToPromise() (+3 more)

### Community 69 - "Worker Index"
Cohesion: 0.18
Nodes (8): Env, ExecutionContextLike, ScheduledControllerLike, worker, MAX_TELEMETRY_BODY_BYTES, runTelemetryRetention(), TelemetryWorkerEnv, BoundStatement

### Community 70 - "AI Variety Report"
Cohesion: 0.21
Nodes (12): BaselineFile, buildMarkdown(), classifyMetric(), JSON_OUTPUT, main(), MARKDOWN_OUTPUT, OUTPUT_DIR, parseArg() (+4 more)

### Community 71 - "Guidance Components"
Cohesion: 0.29
Nodes (12): buildMaskedActionPriors(), decodeProbeBytes(), getModelGuidance(), getOutputTensor(), HTML_PREFIXES, isNumericTensorData(), loadModelBytes(), loadOrtModule() (+4 more)

### Community 72 - "Multiplayer Index"
Cohesion: 0.24
Nodes (7): RFC-8785, canonicalJson(), encoder, hashMatchState(), sha256(), toBase64Url(), StoredRoom

### Community 73 - "Device Profile"
Cohesion: 0.26
Nodes (9): BatteryManagerLike, buildDeviceProfile(), collectBrowserDeviceProfile(), DeviceProfileInput, EMPTY_GPU, NavigatorUAData, readGpuProfile(), safeString() (+1 more)

### Community 74 - "Immutable Board Updates"
Cohesion: 0.24
Nodes (11): Every Cell Duplicated, Structural Sharing Board Diff, Immutable Board Updates, Naive Deep Clone, Next Board, Previous Board, Rejected, Safe Immutable API (+3 more)

### Community 75 - "Draw Trap Replay"
Cohesion: 0.27
Nodes (10): createDrawTrapReplayState(), DRAW_TRAP_CHECKPOINT_MOVE_NUMBERS, DRAW_TRAP_CHECKPOINTS, DRAW_TRAP_REPLAY, parseAction(), parseArrowPayload(), parseReplayEntry(), RAW_DRAW_TRAP_REPLAY (+2 more)

### Community 76 - "Strategic Evaluation Heatmap"
Cohesion: 0.33
Nodes (10): Advanced Well-Supported Checker in Strong Lane, Buried Debt, Front-Row Build, Frozen Critical Liability (Structural Debt), Lane Openness (Strategic Advantage), Overextended Trapped Liability, Score Heatmap, Strategic Evaluation Heatmap (+2 more)

### Community 77 - "Legal Action Types"
Cohesion: 0.25
Nodes (9): climbOne, friendlyStackTransfer, jumpSequence, Legal Actions, Legal Actions Board Diagram, manualUnfreeze, moveSingleToEmpty, splitOneFromStack (+1 more)

### Community 78 - "Negamax Score Inversion"
Cohesion: 0.36
Nodes (9): Alternating-turn Rules, Child Evaluation Score, Zero-sum Negamax Score Scale, Negamax Transformation, Opponent, Parent Score, Score Number Line, Side to Move (+1 more)

### Community 79 - "Dependencies Components"
Cohesion: 0.22
Nodes (9): onnxruntime-web, dependencies, onnxruntime-web, react, react-dom, zustand, react, react-dom (+1 more)

### Community 80 - "Spatial Score Analysis"
Cohesion: 0.50
Nodes (8): Buried Debt, Front-row Controlled Height, Frozen Critical Singles, Jump Lanes, Lane Openness, A–F by 1–6 Spatial Grid, Spatial Score Analysis, Transport Value

### Community 81 - "Hybrid AI Search"
Cohesion: 0.29
Nodes (5): Domain Layer, Search-First AI, Hybrid Search and Neural Guidance, Negamax with Alpha-Beta Search, Immutable Structural Sharing

### Community 82 - "Runtime Architecture"
Cohesion: 0.29
Nodes (5): EngineState as Online Authority, Authoritative Match Room, Structural Sharing Across Runtime Layers, Two-Tier Persistence, Unidirectional Data Flow

### Community 83 - "Package Components"
Cohesion: 0.29
Nodes (4): name, private, type, version

### Community 84 - "Check Markdown Links"
Cohesion: 0.52
Nodes (6): collectMarkdownFiles(), collectMarkdownFilesFromFilesystem(), IGNORE_DIRECTORIES, isExternalTarget(), main(), normalizeTarget()

### Community 85 - "Multiplayer E2E"
Cohesion: 0.48
Nodes (6): assertReadOnlyHistory(), commitMove(), main(), outputDir, RenderedState, waitForRevision()

### Community 86 - "Search Depth Evaluation"
Cohesion: 0.47
Nodes (6): Arbitrary maxDepth, Arbitrary maxDepth Cutoff, Board Evaluation Score (-100 to +10), Search Score vs Depth Chart, Quiescence Tactical Extension, Search Depth (Ply 1 to 6)

### Community 87 - "Favicon Svg"
Cohesion: 0.33
Nodes (6): Dark Inner Square, Favicon SVG, Brown Grid, Orange Circle, Rounded Beige Background, White Circle

### Community 88 - "AI Measurement Protocol"
Cohesion: 0.40
Nodes (3): Explicit Search Budget Contracts, Separate AI Evidence Families, Immutable-Revision A/B Protocol

### Community 89 - "Policy Value Training"
Cohesion: 0.50
Nodes (3): Complete-Bytes Model Loading Pipeline, Small Residual Policy-Value Network, Heuristic-Guided Self-Play Dataset

### Community 90 - "PWA App Icon Group"
Cohesion: 0.40
Nodes (5): Circular Game Pieces, Gridded Board-Game Motif, PWA 512×512 App Icon, Rounded-Square App Icon, Warm Neutral Color Palette

### Community 91 - "Playwright Skill Loader"
Cohesion: 0.40
Nodes (3): playwrightCorePackage, playwrightPackage, require

### Community 93 - "YOUI App Icon"
Cohesion: 0.67
Nodes (4): Stacked checkers, Warm color palette, Warm-toned checkerboard, YOUI app icon

### Community 94 - "Maskable PWA Icon"
Cohesion: 0.67
Nodes (3): Abstract Dual-Tone Circular Motif, PWA Maskable Icon, Rounded Grid Backdrop

## Knowledge Gaps
- **441 isolated node(s):** `name`, `private`, `version`, `type`, `ai:crossplay` (+436 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MultiplayerClient` connect `Multiplayer Client Group` to `Match Room Group`, `Create Game Store Types`, `Types Session`, `Multiplayer Client Group`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `TurnAction` connect `Turn Action` to `AI Measurement Report`, `Risk Components`, `Metrics Components`, `Transitions Components`, `Guards Components`, `Create Game Store Types`, `Jump Components`, `Create Initial State`, `Root Search`, `With Rule Defaults`, `Hash Position`, `Model Types`, `Action Handlers`, `Reducer Components`, `Domain Index`, `Move Ordering`, `AI Index`, `Create Game Store AI Test`, `Catalog Components`, `Strategy Components`, `Participation Components`, `Get Legal Actions`, `Behavior Components`, `AI Selfplay Dataset`, `Action Space`, `Draw Trap Replay`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `Player` connect `Model Types` to `Risk Components`, `Metrics Components`, `Transitions Components`, `Turn Action`, `Guards Components`, `Create Game Store Types`, `Victory Components`, `Jump Components`, `Board Components Group`, `Root Search`, `With Rule Defaults`, `Factories Components`, `Action Handlers`, `Reducer Components`, `Domain Index`, `Move Ordering`, `Types Session`, `Catalog Components`, `Strategy Components`, `Participation Components`, `Turn Summary Strip`, `AI Crossplay Report`, `Behavior Components`, `AI Selfplay Dataset`, `Draw Trap Replay`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _441 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI Measurement Report` be split into smaller, more focused modules?**
  _Cohesion score 0.06286748077792854 - nodes in this community are weakly interconnected._
- **Should `Multi Game E2E` be split into smaller, more focused modules?**
  _Cohesion score 0.07377049180327869 - nodes in this community are weakly interconnected._
- **Should `Perf Report` be split into smaller, more focused modules?**
  _Cohesion score 0.07207792207792207 - nodes in this community are weakly interconnected._