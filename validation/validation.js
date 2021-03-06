/*jslint node: true */
"use strict";
var async = require('async');
var storage = require('../db/storage.js');
var graph = require('../mc/graph.js');
var main_chain = require('../mc/main_chain.js');
var mc_outputs = require("../mc/mc_outputs.js");
var objectHash = require("../base/object_hash.js");
var objectLength = require("../base/object_length.js");
var db = require('../db/db.js');
var chash = require('../encrypt/chash.js');
var mutex = require('../base/mutex.js');
var constants = require("../config/constants.js");
var ValidationUtils = require("../validation/validation_utils.js");
var Definition = require("../encrypt/definition.js");
var conf = require('../config/conf.js');
var profiler = require('../base/profiler.js');
var breadcrumbs = require('../base/breadcrumbs.js');
var round = require('../pow/round.js');
var pow = require('../pow/pow.js');
var deposit = require('../sc/deposit.js');
var validation_byzantine  = require("../validation/validation_byzantine.js");
var byzantine  = require('../mc/byzantine.js');

var MAX_INT32 = Math.pow(2, 31) - 1;

var hasFieldsExcept = ValidationUtils.hasFieldsExcept;
var isNonemptyString = ValidationUtils.isNonemptyString;
var isStringOfLength = ValidationUtils.isStringOfLength;
var isInteger = ValidationUtils.isInteger;
var isNonnegativeInteger = ValidationUtils.isNonnegativeInteger;
var isPositiveInteger = ValidationUtils.isPositiveInteger;
var isNonemptyArray = ValidationUtils.isNonemptyArray;
var isValidAddress = ValidationUtils.isValidAddress;
var isValidBase64 = ValidationUtils.isValidBase64;


function hasValidHashes(objJoint){
	var objUnit = objJoint.unit;
	
	if (objectHash.getUnitHash(objUnit) !== objUnit.unit)
		return false;
	
	return true;
}

function validate(objJoint, callbacks) {
	
	var objUnit = objJoint.unit;
	if (typeof objUnit !== "object" || objUnit === null)
		throw Error("no unit object");
	if (!objUnit.unit)
		throw Error("no unit");
	
	console.log("\nvalidating joint identified by unit "+objJoint.unit.unit);
	
	if (!isStringOfLength(objUnit.unit, constants.HASH_LENGTH))
		return callbacks.ifJointError("wrong unit length");
	
	try{
		// UnitError is linked to objUnit.unit, so we need to ensure objUnit.unit is true before we throw any UnitErrors
		if (objectHash.getUnitHash(objUnit) !== objUnit.unit)
			return callbacks.ifJointError("wrong unit hash: "+objectHash.getUnitHash(objUnit)+" != "+objUnit.unit);
	}
	catch(e){
		return callbacks.ifJointError("failed to calc unit hash: "+e);
	}
	
	if (objJoint.unsigned){
		if (hasFieldsExcept(objJoint, ["unit", "unsigned"]))
			return callbacks.ifJointError("unknown fields in unsigned unit-joint");
	}
	else if ("ball" in objJoint){
		if (!isStringOfLength(objJoint.ball, constants.HASH_LENGTH))
			return callbacks.ifJointError("wrong ball length");
		//if (hasFieldsExcept(objJoint, ["unit", "ball", "skiplist_units", "arrShareDefinition"])) // Victor ShareAddress add arrShareDefinition field
		if (hasFieldsExcept(objJoint, ["unit", "ball", "skiplist_units"])) // Victor ShareAddress add arrShareDefinition field
			return callbacks.ifJointError("unknown fields in ball-joint");
		if ("skiplist_units" in objJoint){
			if (!isNonemptyArray(objJoint.skiplist_units))
				return callbacks.ifJointError("missing or empty skiplist array");
			//if (objUnit.unit.charAt(0) !== "0")
			//    return callbacks.ifJointError("found skiplist while unit doesn't start with 0");
		}
	}
	else{
		//if (hasFieldsExcept(objJoint, ["unit","arrShareDefinition"]))   // Victor ShareAddress add arrShareDefinition field
		if (hasFieldsExcept(objJoint, ["unit"]))   // Victor ShareAddress add arrShareDefinition field
			return callbacks.ifJointError("unknown fields in unit-joint");
	}
	
	if ("content_hash" in objUnit){ // nonserial and stripped off content
		if (!isStringOfLength(objUnit.content_hash, constants.HASH_LENGTH))
			return callbacks.ifUnitError("wrong content_hash length");
	
		// Victor ShareAddress add arrShareDefinition field
		if (hasFieldsExcept(objUnit, ["unit", "version", "alt", "round_index","pow_type","timestamp", "authors", "witnesses", "content_hash", "parent_units", "last_ball", "last_ball_unit", "arrShareDefinition"]))
		return callbacks.ifUnitError("unknown fields in nonserial unit");
		if (!objJoint.ball)
			return callbacks.ifJointError("content_hash allowed only in finished ball");
	}
	else{ // serial
		// Victor ShareAddress add arrShareDefinition field
		if (hasFieldsExcept(objUnit, ["unit", "version", "alt","phase","hp","round_index","pow_type","timestamp", "authors", "coordinators", "messages", "last_ball", "last_ball_unit", "parent_units", "headers_commission", "payload_commission", "arrShareDefinition"])){
			return callbacks.ifUnitError("unknown fields in unit :" + JSON.stringify(objUnit));
		}
		
		//Pow add:
		if (objUnit.pow_type){
			if (typeof objUnit.round_index !== "number")
				return callbacks.ifJointError("no round index");
			if (typeof objUnit.pow_type !== "number")
				return callbacks.ifJointError("no unit type");

			// unity type should be in range of [1,3]
			if ( objUnit.pow_type < 1 || objUnit.pow_type > 3)
				return callbacks.ifJointError("invalid unit type");
			// unity round index should be in range of [1,4204800]
			if ( objUnit.round_index < 1 || objUnit.round_index > 4204800)
				return callbacks.ifJointError("invalid unit round index");
		}


		if (!isNonemptyArray(objUnit.messages))
			return callbacks.ifUnitError("missing or empty messages array");
		if (objUnit.messages.length > constants.MAX_MESSAGES_PER_UNIT)
			return callbacks.ifUnitError("too many messages");

		if(objUnit.pow_type !== constants.POW_TYPE_TRUSTME){
			if (typeof objUnit.headers_commission !== "number")
				return callbacks.ifJointError("no headers_commission");
			if (typeof objUnit.payload_commission !== "number")
				return callbacks.ifJointError("no payload_commission");
			if ( objectLength.getHeadersSize(objUnit) !== objUnit.headers_commission)
				return callbacks.ifJointError("wrong headers commission, expected "+objectLength.getHeadersSize(objUnit));
			if (objectLength.getTotalPayloadSize(objUnit) !== objUnit.payload_commission){
				return callbacks.ifJointError("wrong payload commission, unit "+objUnit.unit+", calculated "+objectLength.getTotalPayloadSize(objUnit)+", expected "+objUnit.payload_commission);
			}
		}
		
	}
	
	if (!isNonemptyArray(objUnit.authors))
		return callbacks.ifUnitError("missing or empty authors array");
	

	if (objUnit.version !== constants.version)
		return callbacks.ifUnitError("wrong version");
	if (objUnit.alt !== constants.alt)
		return callbacks.ifUnitError("wrong alt");

	
	if (!storage.isGenesisUnit(objUnit.unit)){
		if (!isNonemptyArray(objUnit.parent_units))
			return callbacks.ifUnitError("missing or empty parent units array");
		
		if (!isStringOfLength(objUnit.last_ball, constants.HASH_LENGTH))
			return callbacks.ifUnitError("wrong length of last ball");
		if (!isStringOfLength(objUnit.last_ball_unit, constants.HASH_LENGTH))
			return callbacks.ifUnitError("wrong length of last ball unit");
	}

	// recover del
	// if((!objUnit.pow_type || objUnit.pow_type !== constants.POW_TYPE_TRUSTME) && objUnit.coordinators)
	// 	return callbacks.ifUnitError("non trust me unit with coordinators body");
		
	var arrAuthorAddresses = objUnit.authors ? objUnit.authors.map(function(author) { return author.address; } ) : [];
	
	var objValidationState = {
		arrAdditionalQueries: [],
		arrDoubleSpendInputs: [],
		arrInputKeys: []
	};

	// set default sequence is good
	objValidationState.sequence = 'good';
	if (objJoint.unsigned)
		objValidationState.bUnsigned = true;
	
	if (conf.bLight){
		if (!isPositiveInteger(objUnit.timestamp) && !objJoint.unsigned)
			return callbacks.ifJointError("bad timestamp");
		if (objJoint.ball)
			return callbacks.ifJointError("I'm light, can't accept stable unit "+objUnit.unit+" without proof");
		return objJoint.unsigned 
			? callbacks.ifOkUnsigned(true) 
			: callbacks.ifOk({sequence: 'good', arrDoubleSpendInputs: [], arrAdditionalQueries: []}, function(){});
	}
	else{
		if ("timestamp" in objUnit && !isPositiveInteger(objUnit.timestamp))
			return callbacks.ifJointError("bad timestamp");
	}
	
	mutex.lock(arrAuthorAddresses, function(unlock){
		
		var conn = null;

		async.series(
			[
				function(cb){
					db.takeConnectionFromPool(function(new_conn){
						conn = new_conn;
						conn.query("BEGIN", function(){cb();});
					});
				},
				function(cb){
					profiler.start();
					checkDuplicate(conn, objUnit.unit, cb);
				},
				// function(cb){  //pow remove validateHeadersCommissionRecipients
				// 	profiler.stop('validation-checkDuplicate');
				// 	profiler.start();
				// 	objUnit.content_hash ? cb() : validateHeadersCommissionRecipients(objUnit, cb);
				// },
				function(cb){
					//sprofiler.stop('validation-hc-recipients');
					profiler.start();
					!objUnit.parent_units
						? cb()
						: validateHashTree(conn, objJoint, objValidationState, cb);
				},
				function(cb){
					profiler.stop('validation-hash-tree');
					profiler.start();
					!objUnit.parent_units
						? cb()
						: validation_byzantine.validateParents(conn, objJoint, objValidationState, cb);
				},
				function(cb){
					profiler.stop('validation-parents');
					profiler.start();
					!objJoint.skiplist_units
						? cb()
						: validateSkiplist(conn, objJoint.skiplist_units, cb);
				},
				function(cb){
					profiler.start();
					validateAuthors(conn, objUnit.authors, objUnit, objValidationState, cb);
				},
				function(cb){
					profiler.stop('validation-authors');
					profiler.start();
					objUnit.content_hash ? cb() : validateMessages(conn, objUnit.messages, objUnit, objValidationState, cb);
				},
				function(cb){  // pow add: determine witnessed_level and best_parent  .
					profiler.stop('validation-messages');
					profiler.start();
					// move old writer method (updateBestParnt and updateWitnessedlevel) here ,so we can validate pow units' wl is betwwen min_wl and max_wl of each round before writer
				    ValidateWitnessLevel(conn, objUnit, objValidationState, cb);
				},
				function(cb){
					profiler.stop('validation-authors');
					profiler.start();
					objUnit.pow_type == constants.POW_TYPE_TRUSTME ? ValidateCoordinatorsAndTrustmeWithoutFork(conn, objUnit.coordinators, objUnit, objValidationState, cb) : cb();
				}
			], 
			function(err){
				profiler.stop('validation-WitnessLevel');
				if(err){
					conn.query("ROLLBACK", function(){
						conn.release();
						unlock();
						if (typeof err === "object"){
							if (err.error_code === "unresolved_dependency")
								callbacks.ifNeedParentUnits(err.arrMissingUnits);
							else if (err.error_code === "need_hash_tree") // need to download hash tree to catch up
								callbacks.ifNeedHashTree();
							else if (err.error_code === "invalid_joint") // ball found in hash tree but with another unit
								callbacks.ifJointError(err.message);
							else if (err.error_code === "transient")
								callbacks.ifTransientError(err.message);
							else
								throw Error("unknown error code");
						}
						else
							callbacks.ifUnitError(err);
					});
				}
				else{
					profiler.start();
					conn.query("COMMIT", function(){
						conn.release();
						profiler.stop('validation-commit');
						if (objJoint.unsigned){
							unlock();
							callbacks.ifOkUnsigned(objValidationState.sequence === 'good');
						}
						else
							callbacks.ifOk(objValidationState, unlock);
					});
				}
			}
		); // async.series
		
	});
	
}



//  ----------------    


function checkDuplicate(conn, unit, cb){
	conn.query("SELECT 1 FROM units WHERE unit=?", [unit], function(rows){
		if (rows.length === 0) 
			return cb();
		cb("unit "+unit+" already exists");
	});
}

function validateHashTree(conn, objJoint, objValidationState, callback){
	if (!objJoint.ball)
		return callback();
	var objUnit = objJoint.unit;
	conn.query("SELECT unit FROM hash_tree_balls WHERE ball=?", [objJoint.ball], function(rows){
		if (rows.length === 0) 
			return callback({error_code: "need_hash_tree", message: "ball "+objJoint.ball+" is not known in hash tree"});
		if (rows[0].unit !== objUnit.unit)
			return callback(createJointError("ball "+objJoint.ball+" unit "+objUnit.unit+" contradicts hash tree"));
		conn.query(
			"SELECT ball FROM hash_tree_balls WHERE unit IN(?) \n\
			UNION \n\
			SELECT ball FROM balls WHERE unit IN(?) \n\
			ORDER BY ball",
			[objUnit.parent_units, objUnit.parent_units],
			function(prows){
				if (prows.length !== objUnit.parent_units.length)
					return callback(createJointError("some parents not found in balls nor in hash tree")); // while the child is found in hash tree
				var arrParentBalls = prows.map(function(prow){ return prow.ball; });
				if (!objJoint.skiplist_units)
					return validateBallHash();
				conn.query(
					"SELECT ball FROM hash_tree_balls WHERE unit IN(?) \n\
					UNION \n\
					SELECT ball FROM balls WHERE unit IN(?) \n\
					ORDER BY ball", 
					[objJoint.skiplist_units, objJoint.skiplist_units], 
					function(srows){
						if (srows.length !== objJoint.skiplist_units.length)
							return callback(createJointError("some skiplist balls not found"));
						objValidationState.arrSkiplistBalls = srows.map(function(srow){ return srow.ball; });
						validateBallHash();
					}
				);
			
				function validateBallHash(){
					var hash = objectHash.getBallHash(objUnit.unit, arrParentBalls, objValidationState.arrSkiplistBalls, !!objUnit.content_hash);
					if (hash !== objJoint.ball)
						return callback(createJointError("ball hash is wrong"));
					callback();
				}
			}
		);
	});
}

// we cannot verify that skiplist units lie on MC if they are unstable yet, 
// but if they don't, we'll get unmatching ball hash when the current unit reaches stability
function validateSkiplist(conn, arrSkiplistUnits, callback){
	var prev = "";
	async.eachSeries(
		arrSkiplistUnits,
		function(skiplist_unit, cb){
			//if (skiplist_unit.charAt(0) !== "0")
			//    return cb("skiplist unit doesn't start with 0");
			if (skiplist_unit <= prev)
				return cb(createJointError("skiplist units not ordered"));
			conn.query("SELECT unit, is_stable, is_on_main_chain, main_chain_index FROM units WHERE unit=?", [skiplist_unit], function(rows){
				if (rows.length === 0)
					return cb("skiplist unit "+skiplist_unit+" not found");
				var objSkiplistUnitProps = rows[0];
				// if not stable, can't check that it is on MC as MC is not stable in its area yet
				if (objSkiplistUnitProps.is_stable === 1){
					if (objSkiplistUnitProps.is_on_main_chain !== 1)
						return cb("skiplist unit "+skiplist_unit+" is not on MC");
					if (objSkiplistUnitProps.main_chain_index % 10 !== 0)
						return cb("skiplist unit "+skiplist_unit+" MCI is not divisible by 10");
				}
				// we can't verify the choice of skiplist unit.
				// If we try to find a skiplist unit now, we might find something matching on unstable part of MC.
				// Again, we have another check when we reach stability
				cb();
			});
		},
		callback
	);
}

// function validateParents(conn, objJoint, objValidationState, callback){
	
// 	// avoid merging the obvious nonserials
// 	function checkNoSameAddressInDifferentParents(){
// 		if (objUnit.parent_units.length === 1)
// 			return checkLastBallDidNotRetreat();
// 		conn.query("SELECT address, COUNT(*) AS c FROM unit_authors WHERE unit IN(?) GROUP BY address HAVING c>1", [objUnit.parent_units], function(rows){
// 			if (rows.length > 0)
// 				return callback("some addresses found more than once in parents, e.g. "+rows[0].address);
// 			return checkLastBallDidNotRetreat();
// 		});
// 	}
	
// 	function checkLastBallDidNotRetreat(){
// 		conn.query(
// 			"SELECT MAX(lb_units.main_chain_index) AS max_parent_last_ball_mci \n\
// 			FROM units JOIN units AS lb_units ON units.last_ball_unit=lb_units.unit \n\
// 			WHERE units.unit IN(?)",
// 			[objUnit.parent_units],
// 			function(rows){
// 				var max_parent_last_ball_mci = rows[0].max_parent_last_ball_mci;
// 				if (max_parent_last_ball_mci > objValidationState.last_ball_mci)
// 					return callback("last ball mci must not retreat, parents: "+objUnit.parent_units.join(', '));
// 					//checkRoundIndexDidNotRetreat();
// 				callback();
// 			}
// 		);
// 	}

// 	function checkPOWTypeUnitsInRightRound(){
// 		if (!objUnit.pow_type)
// 			return callback();

// 		conn.query(
// 			"SELECT distinct(address), unit, is_on_main_chain, main_chain_index \n\
// 			FROM units JOIN unit_authors using (unit)\n\
// 			WHERE is_stable=1 AND sequence='good' AND pow_type=? AND round_index=? ORDER BY main_chain_index,unit  \n\
// 			LIMIT ?",
// 			[constants.POW_TYPE_POW_EQUHASH, objUnit.round_index, constants.COUNT_POW_WITNESSES],
// 			function(rowsPow){
// 				if (rowsPow.length >= constants.COUNT_POW_WITNESSES){
// 					var lastPowstableUnit = rowsPow[constants.COUNT_POW_WITNESSES - 1];
// 					var lastStableOnMainUnit = lastPowstableUnit.unit;
// 					if (!lastPowstableUnit.is_on_main_chain){
// 						// get main chain unit with same mci
// 						conn.query(
// 							"SELECT unit, is_on_main_chain\n\
// 							FROM units \n\
// 							WHERE is_stable=1 AND is_on_main_chain=1 AND  main_chain_index=? ",
// 							[lastPowstableUnit.main_chain_index],
// 							function(stableMCRows){
// 								if(stableMCRows.length!==1 || stableMCRows[0].is_on_main_chain !==1)
// 									throw Error("the unit is not on main chain");
// 								lastStableOnMainUnit = stableMCRows[0].unit;
// 								main_chain.determineIfStableInLaterUnits(conn, lastStableOnMainUnit, objUnit.parent_units, function(bStable){
// 									if (bStable)
// 										return callback("round index is incorrect because the 8th pow unit already stable in its parent view");

// 									callback();
// 								});
// 							});
// 					}else{
// 						main_chain.determineIfStableInLaterUnits(conn, lastStableOnMainUnit, objUnit.parent_units, function(bStable){
// 							if (bStable)
// 								return callback("on mainchain unit round index is incorrect because the 8th pow unit already stable in its parent view");

// 							callback();
// 						});
// 					}

// 				}else{
// 					callback();
// 				}
// 		});
// 	}

// 	var objUnit = objJoint.unit;
// 	if (objUnit.parent_units.length > constants.MAX_PARENTS_PER_UNIT) // anti-spam
// 		return callback("too many parents: "+objUnit.parent_units.length);
// 	// obsolete: when handling a ball, we can't trust parent list before we verify ball hash
// 	// obsolete: when handling a fresh unit, we can begin trusting parent list earlier, after we verify parents_hash
// 	var createError = objJoint.ball ? createJointError : function(err){ return err; };
// 	// after this point, we can trust parent list as it either agrees with parents_hash or agrees with hash tree
// 	// hence, there are no more joint errors, except unordered parents or skiplist units
// 	var last_ball = objUnit.last_ball;
// 	var last_ball_unit = objUnit.last_ball_unit;
// 	var prev = "";
// 	var arrMissingParentUnits = [];
// 	var arrPrevParentUnitProps = [];
// 	objValidationState.max_parent_limci = 0;
// 	var join = objJoint.ball ? 'LEFT JOIN balls USING(unit) LEFT JOIN hash_tree_balls ON units.unit=hash_tree_balls.unit' : '';
// 	var field = objJoint.ball ? ', IFNULL(balls.ball, hash_tree_balls.ball) AS ball' : '';
// 	async.eachSeries(
// 		objUnit.parent_units, 
// 		function(parent_unit, cb){
// 			if (parent_unit <= prev)
// 				return cb(createError("parent units not ordered"));
// 			prev = parent_unit;
// 			conn.query("SELECT units.*"+field+" FROM units "+join+" WHERE units.unit=?", [parent_unit], function(rows){
// 				if (rows.length === 0){
// 					arrMissingParentUnits.push(parent_unit);
// 					return cb();
// 				}
// 				var objParentUnitProps = rows[0];
// 				// already checked in validateHashTree that the parent ball is known, that's why we throw
// 				if (objJoint.ball && objParentUnitProps.ball === null)
// 					throw Error("no ball corresponding to parent unit "+parent_unit);
// 				if (objParentUnitProps.latest_included_mc_index > objValidationState.max_parent_limci)
// 					objValidationState.max_parent_limci = objParentUnitProps.latest_included_mc_index;
// 				async.eachSeries(
// 					arrPrevParentUnitProps, 
// 					function(objPrevParentUnitProps, cb2){
// 						graph.compareUnitsByProps(conn, objPrevParentUnitProps, objParentUnitProps, function(result){
// 							(result === null) ? cb2() : cb2("parent unit "+parent_unit+" is related to one of the other parent units");
// 						});
// 					},
// 					function(err){
// 						if (err)
// 							return cb(err);
// 						arrPrevParentUnitProps.push(objParentUnitProps);
// 						cb();
// 					}
// 				);
// 			});
// 		}, 
// 		function(err){
// 			if (err)
// 				return callback(err);
// 			if (arrMissingParentUnits.length > 0){
// 				conn.query("SELECT error FROM known_bad_joints WHERE unit IN(?)", [arrMissingParentUnits], function(rows){
// 					(rows.length > 0)
// 						? callback("some of the unit's parents are known bad: "+rows[0].error)
// 						: callback({error_code: "unresolved_dependency", arrMissingUnits: arrMissingParentUnits});
// 				});
// 				return;
// 			}
// 			// this is redundant check, already checked in validateHashTree()
// 			if (objJoint.ball){
// 				var arrParentBalls = arrPrevParentUnitProps.map(function(objParentUnitProps){ return objParentUnitProps.ball; }).sort();
// 				//if (arrParentBalls.indexOf(null) === -1){
// 					var hash = objectHash.getBallHash(objUnit.unit, arrParentBalls, objValidationState.arrSkiplistBalls, !!objUnit.content_hash);
// 					if (hash !== objJoint.ball)
// 						throw Error("ball hash is wrong"); // shouldn't happen, already validated in validateHashTree()
// 				//}
// 			}
// 			conn.query(
// 				"SELECT is_stable, is_on_main_chain, main_chain_index, ball, (SELECT MAX(main_chain_index) FROM units) AS max_known_mci \n\
// 				FROM units LEFT JOIN balls USING(unit) WHERE unit=?", 
// 				[last_ball_unit], 
// 				function(rows){
// 					if (rows.length !== 1) // at the same time, direct parents already received
// 						return callback("last ball unit "+last_ball_unit+" not found");
// 					var objLastBallUnitProps = rows[0];
// 					// it can be unstable and have a received (not self-derived) ball
// 					//if (objLastBallUnitProps.ball !== null && objLastBallUnitProps.is_stable === 0)
// 					//    throw "last ball "+last_ball+" is unstable";
// 					if (objLastBallUnitProps.ball === null && objLastBallUnitProps.is_stable === 1)
// 						throw Error("last ball unit "+last_ball_unit+" is stable but has no ball");
// 					if (objLastBallUnitProps.is_on_main_chain !== 1)
// 						return callback("last ball "+last_ball+" is not on MC");
// 					if (objLastBallUnitProps.ball && objLastBallUnitProps.ball !== last_ball)
// 						return callback("last_ball "+last_ball+" and last_ball_unit "+last_ball_unit+" do not match");
// 					objValidationState.last_ball_mci = objLastBallUnitProps.main_chain_index;
// 					objValidationState.max_known_mci = objLastBallUnitProps.max_known_mci;
// 					if (objValidationState.max_parent_limci < objValidationState.last_ball_mci)
// 						return callback("last ball unit "+last_ball_unit+" is not included in parents, unit "+objUnit.unit);
// 					if (objLastBallUnitProps.is_stable === 1){
// 						// if it were not stable, we wouldn't have had the ball at all
// 						if (objLastBallUnitProps.ball !== last_ball)
// 							return callback("stable: last_ball "+last_ball+" and last_ball_unit "+last_ball_unit+" do not match");
// 						if (objValidationState.last_ball_mci <= 800000)
// 							return checkNoSameAddressInDifferentParents();
// 					}
// 					// Last ball is not stable yet in our view. Check if it is stable in view of the parents
// 					main_chain.determineIfStableInLaterUnitsAndUpdateStableMcFlag(conn, last_ball_unit, objUnit.parent_units, objLastBallUnitProps.is_stable, function(bStable){
// 						if (!bStable && objLastBallUnitProps.is_stable === 1){
// 							var eventBus = require('../base/event_bus.js');
// 							eventBus.emit('nonfatal_error', "last ball is stable, but not stable in parents, unit "+objUnit.unit, new Error());
// 							return checkNoSameAddressInDifferentParents();
// 						}
// 						else if (!bStable)
// 							return callback(objUnit.unit+": last ball unit "+last_ball_unit+" is not stable in view of your parents "+objUnit.parent_units);
// 						conn.query("SELECT ball FROM balls WHERE unit=?", [last_ball_unit], function(ball_rows){
// 							if (ball_rows.length === 0)
// 								throw Error("last ball unit "+last_ball_unit+" just became stable but ball not found");
// 							if (ball_rows[0].ball !== last_ball)
// 								return callback("last_ball "+last_ball+" and last_ball_unit "+last_ball_unit
// 												+" do not match after advancing stability point");
// 							checkNoSameAddressInDifferentParents();
// 						});
// 					});
// 				}
// 			);
// 		}
// 	);
// }


function validateAuthors(conn, arrAuthors, objUnit, objValidationState, callback) {
	if (arrAuthors.length > constants.MAX_AUTHORS_PER_UNIT) // this is anti-spam. Otherwise an attacker would send nonserial balls signed by zillions of authors.
		return callback("too many authors");
	//byzantine del:
	//objValidationState.arrAddressesWithForkedPath = [];
	var prev_address = "";
	for (var i=0; i<arrAuthors.length; i++){
		var objAuthor = arrAuthors[i];
		if (objAuthor.address <= prev_address)
			return callback("author addresses not sorted");
		prev_address = objAuthor.address;
	}

	objValidationState.unit_hash_to_sign = objectHash.getUnitHashToSign(objUnit);
	//pow add: check trust me author must come from pow unit authors of last round
	if(objUnit.pow_type === constants.POW_TYPE_TRUSTME){
		storage.readTimestampOfLastMci(conn, function(lastTimestamp){
				if(lastTimestamp === null)
					return callback("error occured when get Timestamp of last mci");
				lastTimestamp = parseInt(lastTimestamp);
				// validate proposer ID
				// recover add 
				if(objUnit.authors.length === 1){
					if(lastTimestamp > 0){  // validation the time difference between the two trustme units
						var currentTimestamp = objUnit.messages[0].payload.timestamp;
						currentTimestamp = parseInt(currentTimestamp);
						var diff = Math.abs(Math.round(currentTimestamp - lastTimestamp))
						if (diff > constants.TRUSTME_TIMESTAMP_TOLERANT)
							return callback("the time interval is too long between two trustme unit");
					}
					byzantine.getCoordinators(conn, objUnit.hp, objUnit.phase, function(err, proposer, round_index,witnesses){
						if(err)
							return callback("error occured when getCoordinators err info:" + err);
						if(proposer !== objUnit.authors[0].address)
							return callback("proposer incorrect, Expected: "+ proposer +" Actual:" + objUnit.authors[0].address);
						if(round_index !== objUnit.round_index)
							return callback("proposer round_index incorrect, Expected: "+ round_index +" Actual:" + objUnit.round_index);
						async.eachSeries(arrAuthors, function(objAuthor, cb){
							validateAuthor(conn, objAuthor, objUnit, objValidationState, cb);
						}, callback);
					});
				}
				else if(objUnit.authors.length === 11){  // recover trustme unit
					if(lastTimestamp > 0){  // validation the time difference between the two trustme units
						var currentTimestamp = objUnit.messages[0].payload.timestamp;
						currentTimestamp = parseInt(currentTimestamp);
						var diff = Math.abs(Math.round(currentTimestamp - lastTimestamp))
						if (diff < constants.TRUSTME_TIMESTAMP_TOLERANT)
							return callback("the time interval is too short between recover unit and trustme unit");
					}
					byzantine.getCoordinators(conn, objUnit.hp, objUnit.phase, function(err, proposer, round_index,witnesses){
						if(err)
							return callback("error occured when getCoordinators err info:" + err);
						if(round_index !== objUnit.round_index)
							return callback("proposer round_index incorrect, Expected: "+ round_index +" Actual:" + objUnit.round_index);
						conn.query("SELECT address FROM unit_authors WHERE unit=? ORDER BY address", [constants.GENESIS_UNIT], function(rows){
							var ii = 0;
							async.eachSeries(arrAuthors, function(objAuthor, cb){
								if(objAuthor.address !== rows[ii].address)
									return callback("author incorrect :" + objAuthor.address);
								ii++;
								validateAuthor(conn, objAuthor, objUnit, objValidationState, cb);
							}, callback);
						});
					});
				}
				else{
					return callback("trust me unit consist of more than one author")
				}
			}
		);
	}else{
		async.eachSeries(arrAuthors, function(objAuthor, cb){
			validateAuthor(conn, objAuthor, objUnit, objValidationState, cb);
		}, callback);
	}
}

function validateAuthor(conn, objAuthor, objUnit, objValidationState, callback){
	if (!isStringOfLength(objAuthor.address, 32))
		return callback("wrong address length");
	if (hasFieldsExcept(objAuthor, ["address", "authentifiers", "definition"]))
		return callback("unknown fields in author");
	if (!ValidationUtils.isNonemptyObject(objAuthor.authentifiers) && !objUnit.content_hash)
		return callback("no authentifiers");
	for (var path in objAuthor.authentifiers){
		if (!isNonemptyString(objAuthor.authentifiers[path]))
			return callback("authentifiers must be nonempty strings");
		if (objAuthor.authentifiers[path].length > constants.MAX_AUTHENTIFIER_LENGTH)
			return callback("authentifier too long");
	}
	
	var arrAddressDefinition = objAuthor.definition;
	if (isNonemptyArray(arrAddressDefinition)){
		// todo: check that the address is really new?
		// Todo :deposit add: check if deposit contract, if yes, validate only one deposit contract created for supernode address
		validateAuthentifiers(arrAddressDefinition);
	}
	else if (!("definition" in objAuthor)){
		if (!chash.isChashValid(objAuthor.address))
			return callback("address checksum invalid");
		if (objUnit.content_hash){ // nothing else to check
			objValidationState.sequence = 'final-bad';
			return callback();
		}
		// we check signatures using the latest address definition before last ball
		storage.readDefinitionByAddress(conn, objAuthor.address, objValidationState.last_ball_mci, {
			ifDefinitionNotFound: function(definition_chash){
				callback("definition "+definition_chash+" bound to address "+objAuthor.address+" is not defined");
			},
			ifFound: function(arrAddressDefinition){
				validateAuthentifiers(arrAddressDefinition);
			}
		});
	}
	else
		return callback("bad type of definition");

	function validateAuthentifiers(arrAddressDefinition){
		Definition.validateAuthentifiers(
			conn, objAuthor.address, null, arrAddressDefinition, objUnit, objValidationState, objAuthor.authentifiers, 
			function(err, res){
				if (err) // error in address definition
					return callback(err);
				if (!res) // wrong signature or the like
					return callback("authentifier verification failed");
				// pow modi
				//checkSerialAddressUse();
				checkNoPendingChangeOfDefinitionChash();
			}
		);
	}
	
	// in byzantine mode ,we don't need to make sure unit serial any more
	// function findConflictingUnits(handleConflictingUnits){
	// 	var cross = (objValidationState.max_known_mci - objValidationState.max_parent_limci < 1000) ? 'CROSS' : '';
	// 	conn.query( // _left_ join forces use of indexes in units
	// 		"SELECT unit, is_stable \n\
	// 		FROM units \n\
	// 		"+cross+" JOIN unit_authors USING(unit) \n\
	// 		WHERE address=? AND (main_chain_index>? OR main_chain_index IS NULL) AND unit != ?",
	// 		[objAuthor.address, objValidationState.max_parent_limci, objUnit.unit],
	// 		function(rows){
	// 			var arrConflictingUnitProps = [];
	// 			async.eachSeries(
	// 				rows,
	// 				function(row, cb){
	// 					graph.determineIfIncludedOrEqual(conn, row.unit, objUnit.parent_units, function(bIncluded){
	// 						if (!bIncluded)
	// 							arrConflictingUnitProps.push(row);
	// 						cb();
	// 					});
	// 				},
	// 				function(){
	// 					handleConflictingUnits(arrConflictingUnitProps);
	// 				}
	// 			);
	// 		}
	// 	);
	// }


	// function checkSerialAddressUse(){
	// 	var next = checkNoPendingChangeOfDefinitionChash;
	// 	findConflictingUnits(function(arrConflictingUnitProps){
	// 		if (arrConflictingUnitProps.length === 0){ // no conflicting units
	// 			// we can have 2 authors. If the 1st author gave bad sequence but the 2nd is good then don't overwrite
	// 			objValidationState.sequence = objValidationState.sequence || 'good';
	// 			return next();
	// 		}
	// 		var arrConflictingUnits = arrConflictingUnitProps.map(function(objConflictingUnitProps){ return objConflictingUnitProps.unit; });
	// 		breadcrumbs.add("========== found conflicting units "+arrConflictingUnits+" =========");
	// 		breadcrumbs.add("========== will accept a conflicting unit "+objUnit.unit+" =========");
	// 		objValidationState.arrAddressesWithForkedPath.push(objAuthor.address);
	// 		objValidationState.arrConflictingUnits = (objValidationState.arrConflictingUnits || []).concat(arrConflictingUnits);
	// 		bNonserial = true;
	// 		var arrUnstableConflictingUnitProps = arrConflictingUnitProps.filter(function(objConflictingUnitProps){
	// 			return (objConflictingUnitProps.is_stable === 0);
	// 		});
	// 		var bConflictsWithStableUnits = arrConflictingUnitProps.some(function(objConflictingUnitProps){
	// 			return (objConflictingUnitProps.is_stable === 1);
	// 		});
	// 		if (objValidationState.sequence !== 'final-bad') // if it were already final-bad because of 1st author, it can't become temp-bad due to 2nd author
	// 			objValidationState.sequence = bConflictsWithStableUnits ? 'final-bad' : 'temp-bad';
	// 		var arrUnstableConflictingUnits = arrUnstableConflictingUnitProps.map(function(objConflictingUnitProps){ return objConflictingUnitProps.unit; });
	// 		if (bConflictsWithStableUnits) // don't temp-bad the unstable conflicting units
	// 			return next();
	// 		if (arrUnstableConflictingUnits.length === 0)
	// 			return next();
	// 		// we don't modify the db during validation, schedule the update for the write
	// 		objValidationState.arrAdditionalQueries.push(
	// 			{sql: "UPDATE units SET sequence='temp-bad' WHERE unit IN(?) AND +sequence='good'", params: [arrUnstableConflictingUnits]});
	// 		next();
	// 	});
	// }
	
	// don't allow contradicting pending keychanges.
	// We don't trust pending keychanges even when they are serial, as another unit may arrive and make them nonserial
	function checkNoPendingChangeOfDefinitionChash(){
		var next = checkNoPendingDefinition;
		//var filter = bNonserial ? "AND sequence='good'" : "";
		conn.query(
			"SELECT unit FROM address_definition_changes JOIN units USING(unit) \n\
			WHERE address=? AND (is_stable=0 OR main_chain_index>? OR main_chain_index IS NULL)", 
			[objAuthor.address, objValidationState.last_ball_mci], 
			function(rows){
				if (rows.length === 0)
					return next();
				// from this point, our unit is nonserial
				async.eachSeries(
					rows,
					function(row, cb){
						graph.determineIfIncludedOrEqual(conn, row.unit, objUnit.parent_units, function(bIncluded){
							if (bIncluded)
								console.log("checkNoPendingChangeOfDefinitionChash: unit "+row.unit+" is included");
							bIncluded ? cb("found") : cb();
						});
					},
					function(err){
						(err === "found") 
							? callback("you can't send anything before your last included keychange is stable and before last ball (self is nonserial)") 
							: next();
					}
				);
			}
		);
	}
	
	// We don't trust pending definitions even when they are serial, as another unit may arrive and make them nonserial, 
	// then the definition will be removed
	function checkNoPendingDefinition(){
		//var next = checkNoPendingOrRetrievableNonserialIncluded;
		var next = validateDefinition;
		//var filter = bNonserial ? "AND sequence='good'" : "";
		var cross = (objValidationState.max_known_mci - objValidationState.last_ball_mci < 1000) ? 'CROSS' : '';
		conn.query( // _left_ join forces use of indexes in units
			"SELECT unit FROM units "+cross+" JOIN unit_authors USING(unit) \n\
			WHERE address=? AND definition_chash IS NOT NULL AND ( /* is_stable=0 OR */ main_chain_index>? OR main_chain_index IS NULL)", 
			[objAuthor.address, objValidationState.last_ball_mci], 
			function(rows){
				if (rows.length === 0)
					return next();
				// from this point, our unit is nonserial
				async.eachSeries(
					rows,
					function(row, cb){
						graph.determineIfIncludedOrEqual(conn, row.unit, objUnit.parent_units, function(bIncluded){
							if (bIncluded)
								console.log("checkNoPendingDefinition: unit "+row.unit+" is included");
							bIncluded ? cb("found") : cb();
						});
					},
					function(err){
						(err === "found") 
							? callback("you can't send anything before your last included definition is stable and before last ball (self is nonserial)") 
							: next();
					}
				);
			}
		);
	}
	
	function validateDefinition(){
		if (!("definition" in objAuthor))
			return callback();
		// the rest assumes that the definition is explicitly defined
		var arrAddressDefinition = objAuthor.definition;
		storage.readDefinitionByAddress(conn, objAuthor.address, objValidationState.last_ball_mci, {
			ifDefinitionNotFound: function(definition_chash){ // first use of the definition_chash (in particular, of the address, when definition_chash=address)
				if (objectHash.getChash160(arrAddressDefinition) !== definition_chash)
					return callback("wrong definition: "+objectHash.getChash160(arrAddressDefinition) +"!=="+ definition_chash);
				callback();
			},
			ifFound: function(arrAddressDefinition2){ // arrAddressDefinition2 can be different
				handleDuplicateAddressDefinition(arrAddressDefinition2);
			}
		});
	}
	
	function handleDuplicateAddressDefinition(arrAddressDefinition){
		//byzantine del:
		// if (!bNonserial || objValidationState.arrAddressesWithForkedPath.indexOf(objAuthor.address) === -1)
		// 	return callback("duplicate definition of address "+objAuthor.address+", bNonserial="+bNonserial);
		// todo: investigate if this can split the nodes
		// in one particular case, the attacker changes his definition then quickly sends a new ball with the old definition - the new definition will not be active yet
		if (objectHash.getChash160(arrAddressDefinition) !== objectHash.getChash160(objAuthor.definition))
			return callback("unit definition doesn't match the stored definition");
		callback(); // let it be for now. Eventually, at most one of the balls will be declared good
	}
	
}

function validateMessages(conn, arrMessages, objUnit, objValidationState, callback){
	// console.log("validateMessages "+objUnit.unit);
	async.forEachOfSeries(
		arrMessages, 
		function(objMessage, message_index, cb){
			validateMessage(conn, objMessage, message_index, objUnit, objValidationState, cb); 
		}, 
		function(err){
			if (err)
				return callback(err);
			if (!objValidationState.bHasBasePayment && objUnit.pow_type !== constants.POW_TYPE_TRUSTME)
				return callback("no base payment message");
			callback();
		}
	);
}

function validateMessage(conn, objMessage, message_index, objUnit, objValidationState, callback) {
	if (typeof objMessage.app !== "string")
		return callback("no app");
	if (!isStringOfLength(objMessage.payload_hash, constants.HASH_LENGTH))
		return callback("wrong payload hash size");
	if (typeof objMessage.payload_location !== "string")
		return callback("no payload_location");
	
	if (hasFieldsExcept(objMessage, ["app", "payload_hash", "pow_equihash","payload_location", "payload", "payload_uri", "payload_uri_hash", "spend_proofs"]))
		return callback("unknown fields in message");
	
	if (objMessage.payload_location !== "inline" && objMessage.payload_location !== "uri" && objMessage.payload_location !== "none")
		return callback("wrong payload location: "+objMessage.payload_location);

	if (objMessage.payload_location === "none" && ("payload" in objMessage || "payload_uri" in objMessage || "payload_uri_hash" in objMessage))
		return callback("must be no payload");

	if (objMessage.payload_location === "uri"){
		if ("payload" in objMessage)
			return callback("must not contain payload");
		if (typeof objMessage.payload_uri !== "string")
			return callback("no payload uri");
		if (!isStringOfLength(objMessage.payload_uri_hash, constants.HASH_LENGTH))
			return callback("wrong length of payload uri hash");
		if (objMessage.payload_uri.length > 500)
			return callback("payload_uri too long");
		if (objectHash.getBase64Hash(objMessage.payload_uri) !== objMessage.payload_uri_hash)
			return callback("wrong payload_uri hash");
	}
	else{
		if ("payload_uri" in objMessage || "payload_uri_hash" in objMessage)
			return callback("must not contain payload_uri and payload_uri_hash");
	}
	
	if (objMessage.app === "payment"){ // special requirements for payment
		if (objMessage.payload_location !== "inline" && objMessage.payload_location !== "none")
			return callback("payment location must be inline or none");
		if (objMessage.payload_location === "none" && !objMessage.spend_proofs)
			return callback("private payment must come with spend proof(s)");
	}
	// pow modi
	var arrInlineOnlyApps = ["address_definition_change", "data_feed","pow_equihash", "definition_template", "asset", "asset_attestors", "attestation", "poll", "vote"];
	if (arrInlineOnlyApps.indexOf(objMessage.app) >= 0 && objMessage.payload_location !== "inline")
		return callback(objMessage.app+" must be inline");

	
	function validatePayload(cb){
		if (objMessage.payload_location === "inline"){
			validateInlinePayload(conn, objMessage, message_index, objUnit, objValidationState, cb);
		}
		else{
			if (!isValidBase64(objMessage.payload_hash, constants.HASH_LENGTH))
				return cb("wrong payload hash");
			cb();
		}
	}
	
	// byzantine remove
	// function validateSpendProofs(cb){
	// 	if (!("spend_proofs" in objMessage))
	// 		return cb();
	// 	var arrEqs = objMessage.spend_proofs.map(function(objSpendProof){
	// 		return "spend_proof="+conn.escape(objSpendProof.spend_proof)+
	// 			" AND address="+conn.escape(objSpendProof.address ? objSpendProof.address : objUnit.authors[0].address);
	// 	});
	// 	checkForDoublespends(conn, "spend proof", 
	// 		"SELECT address, unit, main_chain_index, sequence FROM spend_proofs JOIN units USING(unit) WHERE unit != ? AND ("+arrEqs.join(" OR ")+")",
	// 		[objUnit.unit], 
	// 		objUnit, objValidationState, function(cb2){ cb2(); }, cb);
	// }
	//async.series([validateSpendProofs, validatePayload], callback);
	async.series([validatePayload], callback);
}

// pow add :
function ValidateWitnessLevel(conn, objUnit, objValidationState, callback) {
	console.log("validating witness level");
	if (!objUnit.parent_units) {//gensis un;
		//objValidationState.best_parent_unit = null;
		objValidationState.witnessed_level = 0;
		return callback();
	}
	var unit_limci;
	var unit_witnessed_level;
	async.series(
		[
			//byzantine del
			// function(cb){
			// 	storage.determineBestParent(conn,objUnit, function(best_parent_unit){
			// 		unit_best_parent = best_parent_unit;
			// 		objValidationState.best_parent_unit = best_parent_unit;
			// 		cb();
			// 	});
			// },
			function(cb){
				storage.determinewitnessedLevelAndLimci(conn,objUnit, function(err,witnessed_level,limci){
					if(err)
						return cb(err);
					unit_witnessed_level = witnessed_level;
					objValidationState.witnessed_level = witnessed_level;
					objValidationState.limci = limci;
					cb();
				});
			},
			function(cb){
				if(!objUnit.pow_type)
					return cb();
				if(objUnit.pow_type !== constants.POW_TYPE_TRUSTME){
					// check there is no trust me unit in this round
					conn.query("SELECT 1 FROM units WHERE round_index=? AND pow_type = ? ", [objUnit.round_index,constants.POW_TYPE_TRUSTME], function(rows){
						if (rows.length === 0)
							return cb("the first unit is not trust me unit of round "+ objUnit.round_index );
						return cb();
					});
				}else{
					return cb();
				}
			},
			function(cb){
				if(!objUnit.pow_type)
					return cb();
				// for only pow related units,validate wl
				round.getMinWlByRoundIndex(conn, objUnit.round_index, function(min_wl){
					if(min_wl === null){ // min_wl is null which means round switch just happen now ,there is no stable trust me unit yet in latest round index.
						// in this condition, we check wl is bigger than last round 's max wl.
						if (objUnit.round_index === 1){//first round
							if(unit_witnessed_level < 0)
								return cb("unit witness level is negative in first round")

							return cb();
						}

						round.getMinWlByRoundIndex(conn, objUnit.round_index-1, function(last_round_min_wl){
							if (last_round_min_wl === null){
								return cb("last_round_min_wl or last_round_min_wl is null ");
							}
						
							return cb();
						});
					}
					else {  //both min and max wl have value means this round is over,// check witnessed_level is betwwen min_wl and max_wl
						if(unit_witnessed_level < min_wl){
							return cb("unit witnessed level " + unit_witnessed_level + "is less than min_wl, min_wl: " + min_wl + JSON.stringify(objUnit) );
						}
						return cb();
					}
				});
			}
	],
	function(err){
		if (err){
			return callback("error occured during validation witnessed_level" + err);
		}
		return callback();
	})
}

// byzantine add :
// validate coordinators and trustme unit fork condition
function ValidateCoordinatorsAndTrustmeWithoutFork(conn, coordinators, objUnit, objValidationState, callback) {
	// console.log("validating ValidateCoordinatorsAndTrustmeWithoutFork");
	// console.log("validating objUnit: " + JSON.stringify(objUnit));
	if(objUnit.authors.length === 11){   // recover trustme unit
		return callback();
	}
	//check only single main chain without fork ,there is no two trust me units with same mci
	storage.getUnitsInfoWithMci(conn,objUnit.hp, function(units){
		if(units.length > 0)
			return callback("duplicated trust me units with same MCI !");
		
		if(coordinators.length <  ( 2 * constants.TOTAL_BYZANTINE + 1) )
			return callback("not enough coordinators, not reach to 2f + 1 threshold ");
		if(coordinators.length > constants.TOTAL_COORDINATORS )
			return callback("too many coordinators ");
		
			// check coordinators are sorted and no duplicated
		var prev_address = "";
		for (var i=0; i<coordinators.length; i++){
			var objCoodinator = coordinators[i];
			if (objCoodinator.address <= prev_address)
				return callback("coordinator addresses not sorted");
			prev_address = objCoodinator.address;
		}

		// console.log("validating coordinators: " + JSON.stringify(coordinators));
		async.eachSeries(coordinators, function(coordinator, cb){
			// Make sure all coordinators are correct witness of round
			round.getWitnessesByRoundIndex(conn, objUnit.round_index, function(witnesses){
				if(witnesses.indexOf(coordinator.address) === -1)
					return cb("Incorrect coordinator deteced :" + coordinator.address);
				// Validate signature
				console.log("come to validateeach coordinator")
				objValidationState.unit_hash_to_sign = objectHash.getProposalHashToSign(objUnit);
				validateAuthor(conn, coordinator, objUnit, objValidationState, cb);
			});
		}, callback);
	});
}


function checkForDoublespends(conn, type, sql, arrSqlArgs, objUnit, objValidationState, onAcceptedDoublespends, cb){
	conn.query(
		sql, 
		arrSqlArgs,
		function(rows){
			if (rows.length === 0) //no double spend, skip it 
				return cb();
			var arrAuthorAddresses = objUnit.authors.map(function(author) { return author.address; } );
			async.eachSeries(
				rows,
				function(objConflictingRecord, cb2){
					if (arrAuthorAddresses.indexOf(objConflictingRecord.address) === -1)
						throw Error("conflicting "+type+" spent from another address?");
					graph.determineIfIncludedOrEqual(conn, objConflictingRecord.unit, objUnit.parent_units, function(bIncluded){
						if (bIncluded){
							var error = objUnit.unit+": conflicting "+type+" in inner unit "+objConflictingRecord.unit;

							// too young (serial or nonserial)
							if (objConflictingRecord.main_chain_index > objValidationState.last_ball_mci || objConflictingRecord.main_chain_index === null)
								return cb2(error);

							// in good sequence (final state)`
							if (objConflictingRecord.sequence === 'good')
								return cb2(error);

							// to be voided: can reuse the output
							if (objConflictingRecord.sequence === 'final-bad')
								return cb2();

							throw Error("unreachable code, conflicting "+type+" in unit "+objConflictingRecord.unit);
						}
						else{
							//byzantine del:
							// if (objValidationState.arrAddressesWithForkedPath.indexOf(objConflictingRecord.address) === -1)
							//	throw Error("double spending "+type+" without double spending address?");
							cb2();
						}
					});
				},
				function(err){//sync.eachSeries callback
					if (err)
						return cb(err);
					// byzantine add
					// here mean double spend units found and units are non serial
					// console.log("Double spend unit found: " + objUnit.unit);
					var arrUnstableConflictingUnitProps = rows.filter(function(objConflictingUnitProps){
						return (objConflictingUnitProps.is_stable === 0);
					});
					var bConflictsWithStableUnits = rows.some(function(objConflictingUnitProps){
						return (objConflictingUnitProps.is_stable === 1);
					});
					if (objValidationState.sequence !== 'final-bad') // if it were already final-bad because of 1st author, it can't become temp-bad due to 2nd author
							objValidationState.sequence = bConflictsWithStableUnits ? 'final-bad' : 'temp-bad';
					var arrUnstableConflictingUnits = arrUnstableConflictingUnitProps.map(function(objConflictingUnitProps){ return objConflictingUnitProps.unit; });
					if (bConflictsWithStableUnits) // don't temp-bad the unstable conflicting units
						return onAcceptedDoublespends(cb);
					if (arrUnstableConflictingUnits.length === 0)
						return onAcceptedDoublespends(cb);

					//	we don't modify the db during validation, schedule the update for the write
					objValidationState.arrAdditionalQueries.push(
						{sql: "UPDATE units SET sequence='temp-bad' WHERE unit IN(?) AND +sequence='good'", params: [arrUnstableConflictingUnits]});
					onAcceptedDoublespends(cb);
				}
			);
		}
	);
}

function validateInlinePayload(conn, objMessage, message_index, objUnit, objValidationState, callback){
	var payload = objMessage.payload;
	if (typeof payload === "undefined")
		return callback("no inline payload");
	if (objectHash.getBase64Hash(payload) !== objMessage.payload_hash)
		return callback("wrong payload hash: expected "+objectHash.getBase64Hash(payload)+", got "+objMessage.payload_hash);

	switch (objMessage.app){

		case "text":
			if (typeof payload !== "string")
				return callback("payload must be string");
			return callback();

		case "address_definition_change":
			if (hasFieldsExcept(payload, ["definition_chash", "address"]))
				return callback("unknown fields in address_definition_change");
			var arrAuthorAddresses = objUnit.authors.map(function(author) { return author.address; } );
			var address;
			if (objUnit.authors.length > 1){
				if (!isValidAddress(payload.address))
					return callback("when multi-authored, must indicate address");
				if (arrAuthorAddresses.indexOf(payload.address) === -1)
					return callback("foreign address");
				address = payload.address;
			}
			else{
				if ('address' in payload)
					return callback("when single-authored, must not indicate address");
				address = arrAuthorAddresses[0];
			}
			if (!objValidationState.arrDefinitionChangeFlags)
				objValidationState.arrDefinitionChangeFlags = {};
			if (objValidationState.arrDefinitionChangeFlags[address])
				return callback("can be only one definition change per address");
			objValidationState.arrDefinitionChangeFlags[address] = true;
			if (!isValidAddress(payload.definition_chash))
				return callback("bad new definition_chash");
			return callback();

		case "poll":
			if (objValidationState.bHasPoll)
				return callback("can be only one poll");
			objValidationState.bHasPoll = true;
			if (typeof payload !== "object" || Array.isArray(payload))
				return callback("poll payload must be object");
			if (hasFieldsExcept(payload, ["question", "choices"]))
				return callback("unknown fields in "+objMessage.app);
			if (typeof payload.question !== 'string')
				return callback("no question in poll");
			if (!isNonemptyArray(payload.choices))
				return callback("no choices in poll");
			if (payload.choices.length > constants.MAX_CHOICES_PER_POLL)
				return callback("too many choices in poll");
			for (var i=0; i<payload.choices.length; i++)
				if (typeof payload.choices[i] !== 'string')
					return callback("all choices must be strings");
			return callback();
			
		case "vote":
			if (!isStringOfLength(payload.unit, constants.HASH_LENGTH))
				return callback("invalid unit in vote");
			if (typeof payload.choice !== "string")
				return callback("choice must be string");
			if (hasFieldsExcept(payload, ["unit", "choice"]))
				return callback("unknown fields in "+objMessage.app);
			conn.query(
				"SELECT main_chain_index, sequence FROM polls JOIN poll_choices USING(unit) JOIN units USING(unit) WHERE unit=? AND choice=?", 
				[payload.unit, payload.choice],
				function(poll_unit_rows){
					if (poll_unit_rows.length > 1)
						throw Error("more than one poll?");
					if (poll_unit_rows.length === 0)
						return callback("invalid choice "+payload.choice+" or poll "+payload.unit);
					var objPollUnitProps = poll_unit_rows[0];
					if (objPollUnitProps.main_chain_index === null || objPollUnitProps.main_chain_index > objValidationState.last_ball_mci)
						return callback("poll unit must be before last ball");
					if (objPollUnitProps.sequence !== 'good')
						return callback("poll unit is not serial");
					return callback();
				}
			);
			break;

		case "data_feed":
			if (objValidationState.bHasDataFeed)
				return callback("can be only one data feed");
			objValidationState.bHasDataFeed = true;
			if (typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length === 0)
				return callback("data feed payload must be non-empty object");
			for (var feed_name in payload){
				if (feed_name.length > constants.MAX_DATA_FEED_NAME_LENGTH)
					return callback("feed name "+feed_name+" too long");
				var value = payload[feed_name];
				if (typeof value === 'string'){
					if (value.length > constants.MAX_DATA_FEED_VALUE_LENGTH)
						return callback("value "+value+" too long");
				}
				else if (typeof value === 'number'){
					if (!isInteger(value))
						return callback("fractional numbers not allowed in data feeds");
				}
				else
					return callback("data feed "+feed_name+" must be string or number");
			}
			return callback();

		case "profile":
			if (objUnit.authors.length !== 1)
				return callback("profile must be single-authored");
			if (objValidationState.bHasProfile)
				return callback("can be only one profile");
			objValidationState.bHasProfile = true;
			// no break, continuing
		case "data":
			if (typeof payload !== "object" || payload === null)
				return callback(objMessage.app+" payload must be object");
			return callback();

		case "definition_template":
			if (objValidationState.bHasDefinitionTemplate)
				return callback("can be only one definition template");
			objValidationState.bHasDefinitionTemplate = true;
			if (!ValidationUtils.isArrayOfLength(payload, 2))
				return callback(objMessage.app+" payload must be array of two elements");
			return callback();

		case "attestation":
			if (objUnit.authors.length !== 1)
				return callback("attestation must be single-authored");
			if (hasFieldsExcept(payload, ["address", "profile"]))
				return callback("unknown fields in "+objMessage.app);
			if (!isValidAddress(payload.address))
				return callback("attesting an invalid address");
			if (typeof payload.profile !== 'object' || payload.profile === null)
				return callback("attested profile must be object");
			// it is ok if the address has never been used yet
			// it is also ok to attest oneself
			return callback();

		case "asset":
			if (objValidationState.bHasAssetDefinition)
				return callback("can be only one asset definition");
			objValidationState.bHasAssetDefinition = true;
			validateAssetDefinition(conn, payload, objUnit, objValidationState, callback);
			break;

		case "asset_attestors":
			if (!objValidationState.assocHasAssetAttestors)
				objValidationState.assocHasAssetAttestors = {};
			if (objValidationState.assocHasAssetAttestors[payload.asset])
				return callback("can be only one asset attestor list update per asset");
			objValidationState.assocHasAssetAttestors[payload.asset] = true;
			validateAssetorListUpdate(conn, payload, objUnit, objValidationState, callback);
			break;

		case "payment":
			validatePayment(conn, payload, message_index, objUnit, objValidationState, callback);
			break;
		// pow add
		case "pow_equihash":
			validatePowEquhash(conn, payload, message_index, objUnit, objValidationState,callback);
			break;
		default:
			return callback("unknown app: "+objMessage.app);
	}
}

// pow add:
function validatePowEquhash(conn, payload, message_index, objUnit, objValidationState,callback){
	if (hasFieldsExcept(payload, ["seed","deposit", "solution"]))
		return callback("unknown fields in pow_equihash message");
	if (objValidationState.bHasBasePowequihash)
		return callback("can have only one PowEquhash message");
	objValidationState.bHasBasePowequihash = true;
    
	// dev branch disale real pow unit check temperorary
	// return callback();

	var firstTrustMEBall = null;
	var depositBalance = 0 ;
	async.series(
		[
			function(cb){// check no bad joints to ensure supernode is not doing bad
				if(objUnit.pow_type !== constants.POW_TYPE_POW_EQUHASH)
					return cb("unit:" + objUnit.unit + " pow_type is not POW_TYPE_POW_EQUHASH with pow_equihash payload!");
				deposit.hasInvalidUnitsFromHistory(conn, objUnit.authors[0].address, function(err,invalid){
					if(err)
						return cb(err);
					if(invalid)
						return cb("supernode [" + objUnit.authors[0].address + "] submited bad joints, can not send unit of type " + object.pow_type);
					return cb();
				});
			},
			// check deposit address is valid and balance 
			function(cb){
				deposit.getDepositAddressBySupernodeAddress(conn, objUnit.authors[0].address, function (err,depositAddress){
					if(err)
						 return cb(err + " can not send pow unit");
					if(payload.deposit != depositAddress)
						return cb("pow unit deposit address is invalid expeected :" + depositAddress +" Actual :" + payload.deposit);
					deposit.getBalanceOfDepositContract(conn, depositAddress,objUnit.round_index,  function (err,balance){
						if(err)
							return cb(err);
						depositBalance = balance;
						cb();
					   }); 
				});
			},
			function(cb){
				round.checkIfPowUnitByRoundIndexAndAddressExists(conn, objUnit.round_index, objUnit.authors[0].address, function(bExist) {
					if(bExist)
						return cb("pow unit can not being sent more than once in certain round");
					 cb();
				});
			},
			function(cb){
				round.getRoundInfoByRoundIndex(conn,objUnit.round_index, function(round_index,min_wl,seed){
					if (seed !== payload.seed )
					   return cb("Wrong seed detected of round " + objUnit.round_index + "expected :"+ seed +",actual :"+payload.seed);
					cb();
				});
			},
			// function(cb){
			// 	round.getDifficultydByRoundIndex(conn,objUnit.round_index, function(difficulty){
			// 		if(difficulty !== payload.difficulty)
			// 			return cb("Wrong difficulty detected of round " + objUnit.round_index + "expected :"+ difficulty +",actual :"+payload.difficulty);
			// 		cb();
			// 	});
			// },
			function(cb){  // find first trust me ball
				round.queryFirstTrustMEBallOnMainChainByRoundIndex(conn,objUnit.round_index, function(err,ball){
					if(err)
						return cb(err);
					firstTrustMEBall = ball;
					cb();
				});
			},
			function(cb){
				var objPowProof = {roundIndex:objUnit.round_index,firstTrustMEBall:firstTrustMEBall, publicSeed:payload.seed,
					superNodeAuthor:objUnit.authors[0].address, deposit: depositBalance} ;
				//check ifsolution is correct
				pow.checkProofOfWork(conn, objPowProof, payload.solution.hash, payload.solution.nonce, function(err){
					if(err)
						return cb("Wrong pow proof of work: "+ err);
					return cb();
				});
				
			}],
			function(err){
				if(err)
					return callback(err)
				callback();
			}
		);


	//Check pow_equihash payload is correct .var payload = {seed: seed, difficulty: difficulty, solution: solution}

}

// used for both public and private payments
function validatePayment(conn, payload, message_index, objUnit, objValidationState, callback){

	if (!("asset" in payload)){ // base currency
		if (hasFieldsExcept(payload, ["inputs", "outputs"]))
			return callback("unknown fields in payment message");
		if (objValidationState.bHasBasePayment)
			return callback("can have only one base payment");
		objValidationState.bHasBasePayment = true;
		return validatePaymentInputsAndOutputs(conn, payload, null, message_index, objUnit, objValidationState, callback);
	}
	
	// asset
	if (!isStringOfLength(payload.asset, constants.HASH_LENGTH))
		return callback("invalid asset");
	
	var arrAuthorAddresses = objUnit.authors.map(function(author) { return author.address; } );
	// note that light clients cannot check attestations
	storage.loadAssetWithListOfAttestedAuthors(conn, payload.asset, objValidationState.last_ball_mci, arrAuthorAddresses, function(err, objAsset){
		if (err)
			return callback(err);
		if (hasFieldsExcept(payload, ["inputs", "outputs", "asset", "denomination"]))
			return callback("unknown fields in payment message");
		if (!isNonemptyArray(payload.inputs))
			return callback("no inputs");
		if (!isNonemptyArray(payload.outputs))
			return callback("no outputs");
		if (objAsset.fixed_denominations){
			if (!isPositiveInteger(payload.denomination))
				return callback("no denomination");
		}
		else{
			if ("denomination" in payload)
				return callback("denomination in arbitrary-amounts asset")
		}
		if (!!objAsset.is_private !== !!objValidationState.bPrivate)
			return callback("asset privacy mismatch");
		var bIssue = (payload.inputs[0].type === "issue");
		var issuer_address;
		if (bIssue){
			if (arrAuthorAddresses.length === 1)
				issuer_address = arrAuthorAddresses[0];
			else{
				issuer_address = payload.inputs[0].address;
				if (arrAuthorAddresses.indexOf(issuer_address) === -1)
					return callback("issuer not among authors");
			}
			if (objAsset.issued_by_definer_only && issuer_address !== objAsset.definer_address)
				return callback("only definer can issue this asset");
		}
		if (objAsset.cosigned_by_definer && arrAuthorAddresses.indexOf(objAsset.definer_address) === -1)
			return callback("must be cosigned by definer");
		
		if (objAsset.spender_attested){
			if (conf.bLight && objAsset.is_private) // if the asset is public, we trust witnesses to have checked attestations
				return callback("being light, I can't check attestations for private assets");
			if (objAsset.arrAttestedAddresses.length === 0)
				return callback("none of the authors is attested");
			if (bIssue && objAsset.arrAttestedAddresses.indexOf(issuer_address) === -1)
				return callback("issuer is not attested");
		}
		validatePaymentInputsAndOutputs(conn, payload, objAsset, message_index, objUnit, objValidationState, callback);
	});
}

// divisible assets (including base asset)
function validatePaymentInputsAndOutputs(conn, payload, objAsset, message_index, objUnit, objValidationState, callback){
	var denomination = payload.denomination || 1;
	var arrAuthorAddresses = objUnit.authors.map(function(author) { return author.address; } );
	var arrInputAddresses = []; // used for non-transferrable assets only
	var arrOutputAddresses = [];
	var total_input = 0;
	if (payload.inputs.length > constants.MAX_INPUTS_PER_PAYMENT_MESSAGE)
		return callback("too many inputs");
	if (payload.outputs.length > constants.MAX_OUTPUTS_PER_PAYMENT_MESSAGE)
		return callback("too many outputs");
	
	if (objAsset && objAsset.fixed_denominations && payload.inputs.length !== 1)
		return callback("fixed denominations payment must have 1 input");

	var total_output = 0;
	var prev_address = ""; // if public, outputs must be sorted by address
	var prev_amount = 0;
	var count_open_outputs = 0;
	for (var i=0; i<payload.outputs.length; i++){
		var output = payload.outputs[i];
		if (hasFieldsExcept(output, ["address", "amount", "blinding", "output_hash"]))
			return callback("unknown fields in payment output");
		if (!isPositiveInteger(output.amount))
			return callback("amount must be positive integer, found "+output.amount);
		if (objAsset && objAsset.fixed_denominations && output.amount % denomination !== 0)
			return callback("output amount must be divisible by denomination");
		if (objAsset && objAsset.is_private){
			if (("output_hash" in output) !== !!objAsset.fixed_denominations)
				return callback("output_hash must be present with fixed denominations only");
			if ("output_hash" in output && !isStringOfLength(output.output_hash, constants.HASH_LENGTH))
				return callback("invalid output hash");
			if (!objAsset.fixed_denominations && !(("blinding" in output) && ("address" in output)))
				return callback("no blinding or address");
			if ("blinding" in output && !isStringOfLength(output.blinding, 16))
				return callback("bad blinding");
			if (("blinding" in output) !== ("address" in output))
				return callback("address and bilinding must come together");
			if ("address" in output && !ValidationUtils.isValidAddressAnyCase(output.address))
				return callback("output address "+output.address+" invalid");
			if (output.address)
				count_open_outputs++;
		}
		else{
			if ("blinding" in output)
				return callback("public output must not have blinding");
			if ("output_hash" in output)
				return callback("public output must not have output_hash");
			if (!ValidationUtils.isValidAddressAnyCase(output.address))
				return callback("output address "+output.address+" invalid");
			if (prev_address > output.address)
				return callback("output addresses not sorted");
			else if (prev_address === output.address && prev_amount > output.amount)
				return callback("output amounts for same address not sorted");
			prev_address = output.address;
			prev_amount = output.amount;
		}
		if (output.address && arrOutputAddresses.indexOf(output.address) === -1)
			arrOutputAddresses.push(output.address);
		total_output += output.amount;
	}
	if (objAsset && objAsset.is_private && count_open_outputs !== 1)
		return callback("found "+count_open_outputs+" open outputs, expected 1");

	var bIssue = false;
	// pow add
	var bCoinbase = false;

	
	// same for both public and private
	function validateIndivisibleIssue(input, cb){
	//	if (objAsset)
	//		profiler2.start();
		conn.query(
			"SELECT count_coins FROM asset_denominations WHERE asset=? AND denomination=?", 
			[payload.asset, denomination], 
			function(rows){
				if (rows.length === 0)
					return cb("invalid denomination: "+denomination);
				if (rows.length > 1)
					throw Error("more than one record per denomination?");
				var denomInfo = rows[0];
				if (denomInfo.count_coins === null){ // uncapped
					if (input.amount % denomination !== 0)
						return cb("issue amount must be multiple of denomination");
				}
				else{
					if (input.amount !== denomination * denomInfo.count_coins)
						return cb("wrong size of issue of denomination "+denomination);
				}
			//	if (objAsset)
			//		profiler2.stop('validateIndivisibleIssue');
				cb();
			}
		);
	}
	
	// max 1 issue must come first, then transfers, then hc, then witnessings
	// no particular sorting order within the groups
	async.forEachOfSeries(
		payload.inputs,
		function(input, input_index, cb){
			if (objAsset){
				if ("type" in input && input.type !== "issue")
					return cb("non-base input can have only type=issue");
			}
			else{
				if ("type" in input && !isNonemptyString(input.type))
					return cb("bad input type");
			}
			var type = input.type || "transfer";

			var doubleSpendFields = "unit, address, message_index, input_index, main_chain_index, sequence, is_stable";
			var doubleSpendWhere;
			var doubleSpendVars = [];

			function checkInputDoubleSpend(cb2){
			//	if (objAsset)
			//		profiler2.start();
				doubleSpendWhere += " AND unit != " + conn.escape(objUnit.unit);
				if (objAsset){
					doubleSpendWhere += " AND asset=?";
					doubleSpendVars.push(payload.asset);
				}
				else
					doubleSpendWhere += " AND asset IS NULL";
				var doubleSpendQuery = "SELECT "+doubleSpendFields+" FROM inputs JOIN units USING(unit) WHERE "+doubleSpendWhere;
				checkForDoublespends(
					conn, "divisible input", 
					doubleSpendQuery, doubleSpendVars, 
					objUnit, objValidationState, 
					function acceptDoublespends(cb3){
						// console.log("--- accepting doublespend on unit "+objUnit.unit);
						var sql = "UPDATE inputs SET is_unique=NULL WHERE "+doubleSpendWhere+
							" AND (SELECT is_stable FROM units WHERE units.unit=inputs.unit)=0";
						if (!(objAsset && objAsset.is_private)){
							objValidationState.arrAdditionalQueries.push({sql: sql, params: doubleSpendVars});
							objValidationState.arrDoubleSpendInputs.push({message_index: message_index, input_index: input_index});
							return cb3();
						}
						mutex.lock(["private_write"], function(unlock){
							// console.log("--- will ununique the conflicts of unit "+objUnit.unit);
							conn.query(
								sql, 
								doubleSpendVars, 
								function(){
									// console.log("--- ununique done unit "+objUnit.unit);
									objValidationState.arrDoubleSpendInputs.push({message_index: message_index, input_index: input_index});
									unlock();
									cb3();
								}
							);
						});
					}, 
					function onDone(err){
						if (err && objAsset && objAsset.is_private)
							throw Error("spend proof didn't help: "+err);
					//	if (objAsset)
					//		profiler2.stop('checkInputDoubleSpend');
						cb2(err);
					}
				);
			}

			switch (type){
				case "issue":
				//	if (objAsset)
				//		profiler2.start();
					if (input_index !== 0)
						return cb("issue must come first");
					if (hasFieldsExcept(input, ["type", "address", "amount", "serial_number"]))
						return cb("unknown fields in issue input");
					if (!isPositiveInteger(input.amount))
						return cb("amount must be positive");
					if (!isPositiveInteger(input.serial_number))
						return cb("serial_number must be positive");
					if (!objAsset || objAsset.cap){
						if (input.serial_number !== 1)
							return cb("for capped asset serial_number must be 1");
					}
					if (bIssue)
						return cb("only one issue per message allowed");
					bIssue = true;
					
					var address = null;
					if (arrAuthorAddresses.length === 1){
						if ("address" in input)
							return cb("when single-authored, must not put address in issue input");
						address = arrAuthorAddresses[0];
					}
					else{
						if (typeof input.address !== "string")
							return cb("when multi-authored, must put address in issue input");
						if (arrAuthorAddresses.indexOf(input.address) === -1)
							return cb("issue input address "+input.address+" is not an author");
						address = input.address;
					}
					
					arrInputAddresses = [address];
					if (objAsset){
						if (objAsset.cap && !objAsset.fixed_denominations && input.amount !== objAsset.cap)
							return cb("issue must be equal to cap");
					}
					else{
						if (!storage.isGenesisUnit(objUnit.unit))
							return cb("only genesis can issue base asset");
						if (input.amount !== constants.TOTAL_WHITEBYTES)
							return cb("issue must be equal to cap");
					}
					total_input += input.amount;
					
					var input_key = (payload.asset || "base") + "-" + denomination + "-" + address + "-" + input.serial_number;
					if (objValidationState.arrInputKeys.indexOf(input_key) >= 0)
						return callback("input "+input_key+" already used");
					objValidationState.arrInputKeys.push(input_key);
					doubleSpendWhere = "type='issue'";
					doubleSpendVars = [];
					if (objAsset && objAsset.fixed_denominations){
						doubleSpendWhere += " AND denomination=?";
						doubleSpendVars.push(denomination);
					}
					if (objAsset){
						doubleSpendWhere += " AND serial_number=?";
						doubleSpendVars.push(input.serial_number);
					}
					if (objAsset && !objAsset.issued_by_definer_only){
						doubleSpendWhere += " AND address=?";
						doubleSpendVars.push(address);
					}
				//	if (objAsset)
				//		profiler2.stop('validate issue');
					if (objAsset && objAsset.fixed_denominations){
						validateIndivisibleIssue(input, function(err){
							if (err)
								return cb(err);
							checkInputDoubleSpend(cb);
						});
					}
					else
						checkInputDoubleSpend(cb);
					// attestations and issued_by_definer_only already checked before
					break;
				// Pow add
				case "coinbase":
						if (input_index !== 0)
							return cb("coinbase must come first");
						if (hasFieldsExcept(input, ["type", "address", "amount"]))
							return cb("unknown fields in issue input");
						if (!isPositiveInteger(input.amount))
							return cb("amount must be positive");
						if (bCoinbase)
							return cb("only one coinbase per message allowed");
							bCoinbase = true;

						if (arrAuthorAddresses.length !== 1){
								return cb("coin base author must be one");
						}

						total_input += input.amount;
						// Check author come from n-2 round pow units authors
						if (objUnit.round_index === 1 )
							return cb("can not send coinbase unit in first round ");

						round.getWitnessesByRoundIndex(conn, objUnit.round_index -1,function (witnessesOFLastTwoRound){
							if(witnessesOFLastTwoRound.indexOf(objUnit.authors[0].address) === -1){
								return cb("coinbase unit author is invalid witness  ");
							}
							// Check duplicate coinbase unit in current round if exists(simialr to doublespend check)
							round.checkIfCoinBaseUnitByRoundIndexAndAddressExists(conn, objUnit.round_index, objUnit.authors[0].address,function(isExisted){
								if(isExisted){
									return cb("coinbase unit by each author can not sent more than once ");
								}
								// check amount is valid
								//if()
								round.getCoinbaseByRoundIndexAndAddress(conn,objUnit.round_index -1,objUnit.authors[0].address,
								function(commission){
									if (commission != input.amount){
										return cb("coinbase unit amount is incorrect ");
									}
									// coinbase unit can only consist of one message 
									if(objUnit.messages.length !== 1 )
										return cb("coinbase unit contains more than one mssage body, pls. check it ");
									 // two outputs for coinbase unit: one is for author self ,the other is for foundation
									if(payload.outputs.length !== 2 )
										return cb("coinbase units must have two outputs");
									var founddation_outputs= payload.outputs.filter(function(output) {return output.address == constants.FOUNDATION_ADDRESS });
									if(founddation_outputs.length !== 1)
										return cb("moe than one outputs to foundation address occured");
									var coinbase_foundation_amount = Math.floor(input.amount * constants.FOUNDATION_RATIO);
									if(founddation_outputs[0].amount !== coinbase_foundation_amount )
										return cb("foundation share is incoorect in coinbase unit Expected: "+ coinbase_foundation_amount + "Actual :" + founddation_outputs[0].amount);
									return cb();
								});
							});
						})
						break;

				case "transfer":
					if (hasFieldsExcept(input, ["type", "unit", "message_index", "output_index"]))
						return cb("unknown fields in payment input");
					if (!isStringOfLength(input.unit, constants.HASH_LENGTH))
						return cb("wrong unit length in payment input");
					if (!isNonnegativeInteger(input.message_index))
						return cb("no message_index in payment input");
					if (!isNonnegativeInteger(input.output_index))
						return cb("no output_index in payment input");
					
					var input_key = (payload.asset || "base") + "-" + input.unit + "-" + input.message_index + "-" + input.output_index;
					if (objValidationState.arrInputKeys.indexOf(input_key) >= 0)
						return cb("input "+input_key+" already used");
					objValidationState.arrInputKeys.push(input_key);
					
					doubleSpendWhere = "type=? AND src_unit=? AND src_message_index=? AND src_output_index=?";
					doubleSpendVars = [type, input.unit, input.message_index, input.output_index];
					
					// for private fixed denominations assets, we can't look up src output in the database 
					// because we validate the entire chain before saving anything.
					// Instead we prepopulate objValidationState with denomination and src_output 
					if (objAsset && objAsset.is_private && objAsset.fixed_denominations){
						if (!objValidationState.src_coin)
							throw Error("no src_coin");
						var src_coin = objValidationState.src_coin;
						if (!src_coin.src_output)
							throw Error("no src_output");
						if (!isPositiveInteger(src_coin.denomination))
							throw Error("no denomination in src coin");
						if (!isPositiveInteger(src_coin.amount))
							throw Error("no src coin amount");
						var owner_address = src_coin.src_output.address;
						if (arrAuthorAddresses.indexOf(owner_address) === -1)
							return cb("output owner is not among authors");
						if (denomination !== src_coin.denomination)
							return cb("private denomination mismatch");
						if (objAsset.auto_destroy && owner_address === objAsset.definer_address)
							return cb("this output was destroyed by sending to definer address");
						if (objAsset.spender_attested && objAsset.arrAttestedAddresses.indexOf(owner_address) === -1)
							return cb("owner address is not attested");
						if (arrInputAddresses.indexOf(owner_address) === -1)
							arrInputAddresses.push(owner_address);
						total_input += src_coin.amount;
						// console.log("-- val state "+JSON.stringify(objValidationState));
					//	if (objAsset)
					//		profiler2.stop('validate transfer');
						return checkInputDoubleSpend(cb);
					}
					
					conn.query(
						"SELECT amount, is_stable, sequence, address, main_chain_index, denomination, asset \n\
						FROM outputs \n\
						JOIN units USING(unit) \n\
						WHERE outputs.unit=? AND message_index=? AND output_index=?",
						[input.unit, input.message_index, input.output_index],
						function(rows){
							if (rows.length > 1)
								throw Error("more than 1 src output");
							if (rows.length === 0)
								return cb("input unit "+input.unit+" not found");
							var src_output = rows[0];
							if (typeof src_output.amount !== 'number')
								throw Error("src output amount is not a number");
							if (!(!payload.asset && !src_output.asset || payload.asset === src_output.asset))
								return cb("asset mismatch");
							//if (src_output.is_stable !== 1) // we allow immediate spends, that's why the error is transient
							//    return cb(createTransientError("input unit is not on stable MC yet, unit "+objUnit.unit+", input "+input.unit));
							if (!objAsset || !objAsset.is_private){
								// for public payments, you can't spend unconfirmed transactions
								if (src_output.main_chain_index > objValidationState.last_ball_mci || src_output.main_chain_index === null)
									return cb("src output must be before last ball");
							}
							if (src_output.sequence !== 'good') // it is also stable or private
								return cb("input unit "+input.unit+" is not serial");
							var owner_address = src_output.address;
							if (arrAuthorAddresses.indexOf(owner_address) === -1)
								return cb("output owner is not among authors");
							if (denomination !== src_output.denomination)
								return cb("denomination mismatch");
							if (objAsset && objAsset.auto_destroy && owner_address === objAsset.definer_address)
								return cb("this output was destroyed by sending it to definer address");
							if (objAsset && objAsset.spender_attested && objAsset.arrAttestedAddresses.indexOf(owner_address) === -1)
								return cb("owner address is not attested");
							if (arrInputAddresses.indexOf(owner_address) === -1)
								arrInputAddresses.push(owner_address);
							total_input += src_output.amount;
							
							if (!objAsset || !objAsset.is_private)
								return checkInputDoubleSpend(checkDepositAddressSpend);
							// for private payments only, unit already saved (if public, we are already before last ball)
							// when divisible, the asset is also non-transferrable and auto-destroy, 
							// then this transfer is a transfer back to the issuer 
							// and input.unit is known both to payer and the payee (issuer), even if light
							graph.determineIfIncluded(conn, input.unit, [objUnit.unit], function(bIncluded){
								if (!bIncluded)
									return cb("input "+input.unit+" is not in your genes");
								checkInputDoubleSpend(checkDepositAddressSpend);
							});
							
						    // Deposit add : if owner_address is deposit address , additional check if user has rights to spend it now.
							 function checkDepositAddressSpend(){
								if (objUnit.authors.length !== 2)
									return cb();	
									
								// console.log("===================Start to check spend deposit balance");
								var supernodes = objUnit.authors.filter( function (author) { return author.address != owner_address });
								var coAuthorAddr = supernodes[0].address ;
								// Check owner address is kind of deposit address  
								// console.log("===================coAuthorAddr: "+ coAuthorAddr +" | owner_address: " +owner_address);
								deposit.getSupernodeByDepositAddress(conn, owner_address, function(err, supernodeinfo){
									if(err){
										// no correspont supernode which indicates owner_address is not deposit address
										return cb();
									}
									// console.log("===================Deposit address: " + owner_address + "  supernode address: "+ supernodeinfo[0].address);
									// owner_address is deposit address
									deposit.hasInvalidUnitsFromHistory(conn, supernodeinfo[0].address, function (err, isInvalid){
										if(err) //normal tranaction
											return cb(err);
										
										round.getLastCoinbaseUnitRoundIndex(conn, supernodeinfo[0].address, function(err, lastCoinBaseRound){
											if(err)
												return cb(err);
											// console.log("===================got last coin base round is : "+ lastCoinBaseRound);
											round.getCurrentRoundIndex(conn, function(latestRoundIndex){
												if (constants.FOUNDATION_SAFE_ADDRESS === coAuthorAddr){ // foundation spend deposit condition
													if(!isInvalid) // supernode is good condition
														return cb("supernode [" + supernodeinfo[0].address + "] don not submit bad joints, Foundation can not spend its deposit balance ");
													if(lastCoinBaseRound === 0 ) // never participate in minning and no coinbase  record
														return cb("supernode [" + supernodeinfo[0].address + "] don not submit coinbase unit,  Foundation can not spend its deposit balance ");
													
													// console.log("===================got current  round is : "+ latestRoundIndex);
													// check if delay n round to spend 
													if((latestRoundIndex - lastCoinBaseRound) < constants.COUNT_ROUNDS_FOR_FOUNDATION_SPEND_DEPOSIT){
														return cb("Foundation safe address can not spend deposit contract balance before ")
													}
													return cb(); // OK condition
												}
												else if(coAuthorAddr === supernodeinfo[0].safe_address){ // condition for supernode spend the deposit balance
													if(lastCoinBaseRound === 0 ) // not mine at all, take it anytime
														return cb();
													if(isInvalid)
														return cb("supernode [" + supernodeinfo[0].address + "] submit bad joints, can not spend its deposit balance ");
													
													// console.log("===================got current  round is : "+ latestRoundIndex);
													if((latestRoundIndex - lastCoinBaseRound) < constants.COUNT_ROUNDS_FOR_SUPERNODE_SPEND_DEPOSIT){
														return cb("supernode can not spend deposit contract balance before round " + (lastCoinBaseRound + constants.COUNT_ROUNDS_FOR_SUPERNODE_SPEND_DEPOSIT));
													}

													// console.log("===================OK to spend deposit balance");
													return cb();  // OK condition
												}
												return cb("unknown user:" + coAuthorAddr +" try to spend deposit :" + owner_address );
											});
										});
										
									});		
								});
							}
						});
					break;
				default:
					return cb("unrecognized input type: "+input.type);
			}
		},
		function(err){ // async.forEachOfSeries callback
			// console.log("inputs done "+payload.asset, arrInputAddresses, arrOutputAddresses);
			if (err)
				return callback(err);
			if (objAsset){
				if (total_input !== total_output)
					return callback("inputs and outputs do not balance: "+total_input+" !== "+total_output);
				if (!objAsset.is_transferrable){ // the condition holds for issues too
					if (arrInputAddresses.length === 1 && arrInputAddresses[0] === objAsset.definer_address
					   || arrOutputAddresses.length === 1 && arrOutputAddresses[0] === objAsset.definer_address
						// sending payment to the definer and the change back to oneself
					   || !(objAsset.fixed_denominations && objAsset.is_private) 
							&& arrInputAddresses.length === 1 && arrOutputAddresses.length === 2 
							&& arrOutputAddresses.indexOf(objAsset.definer_address) >= 0
							&& arrOutputAddresses.indexOf(arrInputAddresses[0]) >= 0
					   ){
						// good
					}
					else
						return callback("the asset is not transferrable");
				}
				var arrCondition = bIssue ? objAsset.issue_condition : objAsset.transfer_condition;
				if (arrCondition){
					Definition.evaluateAssetCondition(
						conn, payload.asset, arrCondition, objUnit, objValidationState, 
						function(cond_err, bSatisfiesCondition){
							if (cond_err)
								return callback(cond_err);
							if (!bSatisfiesCondition)
								return callback("transfer or issue condition not satisfied");
							console.log("validatePaymentInputsAndOutputs with transfer/issue conditions done");
							callback();
						}
					);
					return;
				}
			}
			else{ // base asset
				if (total_input !== total_output + objUnit.headers_commission + objUnit.payload_commission)
					return callback("inputs and outputs do not balance: "+total_input+" !== "+total_output+" + "+objUnit.headers_commission+" + "+objUnit.payload_commission);
			}
			console.log("validatePaymentInputsAndOutputs done");
		//	if (objAsset)
		//		profiler2.stop('validate IO');
			callback();
		}
	);
}


function initPrivatePaymentValidationState(conn, unit, message_index, payload, onError, onDone){
	conn.query(
		"SELECT payload_hash, app, units.sequence, units.is_stable, lb_units.main_chain_index AS last_ball_mci \n\
		FROM messages JOIN units USING(unit) \n\
		LEFT JOIN units AS lb_units ON units.last_ball_unit=lb_units.unit \n\
		WHERE messages.unit=? AND message_index=?", 
		[unit, message_index], 
		function(rows){
			if (rows.length > 1)
				throw Error("more than 1 message by index");
			if (rows.length === 0)
				return onError("message not found");
			var row = rows[0];
			if (row.sequence !== "good" && row.is_stable === 1)
				return onError("unit is final nonserial");
			var bStable = (row.is_stable === 1); // it's ok if the unit is not stable yet
			if (row.app !== "payment")
				return onError("invalid app");
			if (objectHash.getBase64Hash(payload) !== row.payload_hash)
				return onError("payload hash does not match");
			var objValidationState = {
				last_ball_mci: row.last_ball_mci,
				arrDoubleSpendInputs: [],
				arrInputKeys: [],
				bPrivate: true
			};
			var objPartialUnit = {unit: unit};
			storage.readUnitAuthors(conn, unit, function(arrAuthors){
				objPartialUnit.authors = arrAuthors.map(function(address){ return {address: address}; }); // array of objects {address: address}
				onDone(bStable, objPartialUnit, objValidationState);
			});
		}
	);
}


function validateAssetDefinition(conn, payload, objUnit, objValidationState, callback){
	if (objUnit.authors.length !== 1)
		return callback("asset definition must be single-authored");
	if (hasFieldsExcept(payload, ["cap", "is_private", "is_transferrable", "auto_destroy", "fixed_denominations", "issued_by_definer_only", "cosigned_by_definer", "spender_attested", "issue_condition", "transfer_condition", "attestors", "denominations"]))
		return callback("unknown fields in asset definition");
	if (typeof payload.is_private !== "boolean" || typeof payload.is_transferrable !== "boolean" || typeof payload.auto_destroy !== "boolean" || typeof payload.fixed_denominations !== "boolean" || typeof payload.issued_by_definer_only !== "boolean" || typeof payload.cosigned_by_definer !== "boolean" || typeof payload.spender_attested !== "boolean")
		return callback("some required fields in asset definition are missing");

	if ("cap" in payload && !(isPositiveInteger(payload.cap) && payload.cap <= constants.MAX_CAP))
		return callback("invalid cap");

	// attestors
	var err;
	if ( payload.spender_attested && (err=checkAttestorList(payload.attestors)) )
		return callback(err);

	// denominations
	if (payload.fixed_denominations && !isNonemptyArray(payload.denominations))
		return callback("denominations not defined");
	if (payload.denominations){
		if (payload.denominations.length > constants.MAX_DENOMINATIONS_PER_ASSET_DEFINITION)
			return callback("too many denominations");
		var total_cap_from_denominations = 0;
		var bHasUncappedDenominations = false;
		var prev_denom = 0;
		for (var i=0; i<payload.denominations.length; i++){
			var denomInfo = payload.denominations[i];
			if (!isPositiveInteger(denomInfo.denomination))
				return callback("invalid denomination");
			if (denomInfo.denomination <= prev_denom)
				return callback("denominations unsorted");
			if ("count_coins" in denomInfo){
				if (!isPositiveInteger(denomInfo.count_coins))
					return callback("invalid count_coins");
				total_cap_from_denominations += denomInfo.count_coins * denomInfo.denomination;
			}
			else
				bHasUncappedDenominations = true;
			prev_denom = denomInfo.denomination;
		}
		if (bHasUncappedDenominations && total_cap_from_denominations)
			return callback("some denominations are capped, some uncapped");
		if (bHasUncappedDenominations && payload.cap)
			return callback("has cap but some denominations are uncapped");
		if (total_cap_from_denominations && !payload.cap)
			return callback("has no cap but denominations are capped");
		if (total_cap_from_denominations && payload.cap !== total_cap_from_denominations)
			return callback("cap doesn't match sum of denominations");
	}
	
	if (payload.is_private && payload.is_transferrable && !payload.fixed_denominations)
		return callback("if private and transferrable, must have fixed denominations");
	if (payload.is_private && !payload.fixed_denominations){
		if (!(payload.auto_destroy && !payload.is_transferrable))
			return callback("if private and divisible, must also be auto-destroy and non-transferrable");
	}
	if (payload.cap && !payload.issued_by_definer_only)
		return callback("if capped, must be issued by definer only");
	
	// possible: definer is like black hole
	//if (!payload.issued_by_definer_only && payload.auto_destroy)
	//    return callback("if issued by anybody, cannot auto-destroy");
	
	// possible: the entire issue should go to the definer
	//if (!payload.issued_by_definer_only && !payload.is_transferrable)
	//    return callback("if issued by anybody, must be transferrable");
	
	objValidationState.bDefiningPrivateAsset = payload.is_private;
	
	async.series([
		function(cb){
			if (!("issue_condition" in payload))
				return cb();
			Definition.validateDefinition(conn, payload.issue_condition, objUnit, objValidationState, true, cb);
		},
		function(cb){
			if (!("transfer_condition" in payload))
				return cb();
			Definition.validateDefinition(conn, payload.transfer_condition, objUnit, objValidationState, true, cb);
		}
	], callback);
}

function validateAssetorListUpdate(conn, payload, objUnit, objValidationState, callback){
	if (objUnit.authors.length !== 1)
		return callback("attestor list must be single-authored");
	if (!isStringOfLength(payload.asset, constants.HASH_LENGTH))
		return callback("invalid asset in attestor list update");
	storage.readAsset(conn, payload.asset, objValidationState.last_ball_mci, function(err, objAsset){
		if (err)
			return callback(err);
		if (!objAsset.spender_attested)
			return callback("this asset does not require attestors");
		if (objUnit.authors[0].address !== objAsset.definer_address)
			return callback("attestor list can be edited only by definer");
		err = checkAttestorList(payload.attestors);
		if (err)
			return callback(err);
		callback();
	});
}

function checkAttestorList(arrAttestors){
	if (!isNonemptyArray(arrAttestors))
		return "attestors not defined";
	if (arrAttestors.length > constants.MAX_ATTESTORS_PER_ASSET)
		return "too many attestors";
	var prev="";
	for (var i=0; i<arrAttestors.length; i++){
		if (arrAttestors[i] <= prev)
			return "attestors not sorted";
		if (!isValidAddress(arrAttestors[i]))
			return "invalid attestor address: "+arrAttestors[i];
		prev = arrAttestors[i];
	}
	return null;
}



function validateAuthorSignaturesWithoutReferences(objAuthor, objUnit, arrAddressDefinition, callback){
	var objValidationState = {
		unit_hash_to_sign: objectHash.getUnitHashToSign(objUnit),
		last_ball_mci: -1,
		bNoReferences: true
	};
	Definition.validateAuthentifiers(
		null, objAuthor.address, null, arrAddressDefinition, objUnit, objValidationState, objAuthor.authentifiers, 
		function(err, res){
			if (err) // error in address definition
				return callback(err);
			if (!res) // wrong signature or the like
				return callback("authentifier verification failed");
			callback();
		}
	);
}


function createTransientError(err){
	return {
		error_code: "transient", 
		message: err
	};
}

// A problem is with the joint rather than with the unit. That is, the field that has an issue is not covered by unit hash.
function createJointError(err){
	return {
		error_code: "invalid_joint", 
		message: err
	};
}


exports.validate = validate;
exports.hasValidHashes = hasValidHashes;
exports.validateAuthorSignaturesWithoutReferences = validateAuthorSignaturesWithoutReferences;
exports.validatePayment = validatePayment;
exports.initPrivatePaymentValidationState = initPrivatePaymentValidationState;
exports.validateProposalJoint = validation_byzantine.validateProposalJoint;
