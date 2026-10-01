// === ART:CONTRACT BEGIN ===
/* ENGINE_BATTLE contract, read from Day 146 source and confirmed by a live run (test/engine-shapes.js), engine 1.0.0.
 *
 * API: ENGINE_BATTLE = { version, templates, evalExpr, gaugeMax (65536), schedulers ['atb','rounds','conditional'],
 *   progressions ['materia','jobs','classes'], init, advance, run, replay, forecast, suggest }
 *   init(data, seed, opts) -> state.  data = { ruleset, records (bundle.rules), party: [member], troopId, weatherId }.
 *     opts = { waitMode, scheduler, tickCap (20000), attackPower, damageCap, limitRate, events, noDamageLog }.
 *   advance(state, input) -> { state, events, awaiting }. Never mutates its input (deep clones via JSON).
 *     input: null runs to the next decision (can be a whole foe turn or several), {type:'step', ticks:n},
 *     {type:'command', actor, abl, target | targets}, {type:'flee', actor}.
 *   suggest(state, policy) -> the default party policy's input for state.awaiting.actor.
 *   replay(data, seed, opts, [{t, input}]) -> { state, events, awaiting }.  run(data, seed, policy, opts) -> { events, result }.
 *
 * Snapshot (init state) keys: v seed rng{a,calls} t turns sched progression waitMode tickCap gaugeMax db units readyQueue
 *   awaiting round preemptive result res damageLog lastAttacker noLog.  About 10 KB for a 3 v 2 battle.
 *   db: abl attack attackPower damageCap elements fx gmb inverts limitRate relations roles sta stats troop warnings weather
 *     weatherId.  db.abl[id] = {id,name,kind,element,power,cost{mp},chargeTicks,targeting{side,scope},statusEffects,fx,revive};
 *     the built in attack is id '_attack' (db.attack).  db.troop = {id, name, noEscape, preemptive}.
 *   unit (both sides): uid ('p0'..'pN' party, 'e0'..'eN' foes, in data order), side 'party'|'foe', ref (chr_ or enm_ id),
 *     name (repeated foe names get ' A', ' B' suffixes), level, row 'front'|'back', stats{}, maxHp maxMp hp mp gauge fill
 *     ready charging{abl,targets,left}|null statuses[{sta,left}] ko turns kills affinity{} tax mods{} addedEffects
 *     attackElement counter commands limits limit{gauge,level,uses,usesAtLevel,kills}|null gambit nextAt frozenTicks limitFlag.
 *   party unit adds: weaponClass statMods supports.  foe unit adds: fam tier palette{base,accent} isBoss gil exp ap.
 *   state.awaiting = { actor, commands:[{key,label,abls:[{id,name,mp,ok,side,scope,element,kind}]}], targets:{foe:[],party:[]} }.
 *
 * Events: every event is { type, t, actor, target, value, element, crit } plus abl, name, targets where useful.
 *   tick       value = ticks advanced. One per advance call that moved time. Carries NO gauge values.
 *   ready      actor.
 *   command    actor, abl, name, targets; value 'flee' for a flee attempt.
 *   action     actor, abl, name, element, targets; value 'counter' when it is a counter. No MP cost field.
 *   damage     actor (null for status ticks), target, value (already clamped), element, crit, abl.
 *   heal       actor, target, value (HP actually restored, after clamping), abl.
 *   miss       overloaded: a missed hit (target set), value 'mp' (not enough MP), value 'flee' with name 'Cannot escape' or
 *              'Could not escape', value 'rejected' (bad input, name explains), or a status that failed to land (value staId).
 *   status     target, value staId (applied) or '-' + staId (removed, name is 'cured', 'woke', or 'wore off').
 *   limitReady target, value 'full' (gauge filled) or 'level<N>' (new limit level unlocked).
 *   ko         actor (killer or null), target.      revive  actor, target, abl.      end  value 'win'|'lose'|'flee'|'timeout'.
 *
 * Gaps against the plan, to resolve in Phase 5:
 *   1. ATB gauges never appear in events, so display() cannot be derived from events alone. The presenter must take the
 *      state returned by each advance as well (feed(events, state)) and read units[].gauge, ready, charging from it.
 *   2. MP changes are not evented (action has no cost; mpAbsorb and mpDrain ticks emit nothing). Rolling MP also reads state.
 *   3. There is no item event and no Item command: items are not modeled in battle. The item use beat has nothing to drive
 *      until a later engine version adds one, so Phase 5 builds the beat behind a feature check on the event type.
 *   4. Replays stay deterministic: the state is a pure function of seed plus inputs, so reading it does not break the rule
 *      that beat timing never feeds back into the engine.
 */
// === ART:CONTRACT END ===
