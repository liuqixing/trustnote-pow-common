/*jslint node: true */
"use strict";

/**
 *	@boss	XING
 */

const _				= require( 'lodash' );
const _async			= require( 'async' );
const _storage			= require( '../db/storage.js' );
const _object_hash		= require( '../base/object_hash.js' );
const _db			= require( '../db/db.js' );
const _mutex			= require( '../base/mutex.js' );
const _validation		= require( '../validation/validation.js' );
const _round			= require( '../pow/round.js' );
const _event_bus		= require( '../base/event_bus.js' );
const _conf             = require('../config/conf.js');
//const _witness_pow_proof	= require( '../witness/witness_pow_proof.js' );		//	POW DEL	2018/9/6 11:15 AM


/**
 *	last round index from all outbound peers
 */
let _nLastRoundIndexFromPeers	= null;
let _nLastMainChainIndexFromPeers	= null;


// /**
//  * 	POW MOD
//  *	@param	{object}	catchupRequest
//  *	@param	{object}	callbacks
//  *	@return {*}
//  */
// function prepareCatchupChainOld( catchupRequest, callbacks )
// {
// 	let last_stable_mci	= catchupRequest.last_stable_mci;
// 	let last_known_mci	= catchupRequest.last_known_mci;

// 	if ( typeof last_stable_mci !== "number" )
// 	{
// 		return callbacks.ifError( "no last_stable_mci" );
// 	}
// 	if ( typeof last_known_mci !== "number" )
// 	{
// 		return callbacks.ifError( "no last_known_mci" );
// 	}
// 	// if ( last_stable_mci >= last_known_mci && ( last_known_mci > 0 || last_stable_mci > 0 ) )
// 	// {
// 	// 	return callbacks.ifError( "last_stable_mci >= last_known_mci" );
// 	// }

// 	/**
// 	 *	POW DEL
// 	 *	@author	XING
// 	 *	@datetime	2018/8/9 7:25 PM
// 	 */
// 	// if (!Array.isArray(arr_witnesses))
// 	// 	return callbacks.ifError("no witnesses");

// 	let objCatchupChain = {
// 		last_round_index			: null,	//	POW ADD @2018/10/9 4:30 PM  by Liu Qixing
// 		//unstable_mc_joints			: [],	//	POW DEL	@2018/9/6 11:24 AM  by Liu Qixing
// 		stable_last_ball_joints			: [],
// 		//witness_change_and_definition_joints	: []	//	POW DEL
// 	};
// 	let sLastBallUnit	= null;

// 	//	...
// 	_async.series
// 	([
// 		function( pfnNext )
// 		{
// 			//
// 			//	get current round index
// 			//
// 			_round.getCurrentRoundIndex( null, function( nCurrentRoundIndex )
// 			{
// 				if ( 'number' === typeof nCurrentRoundIndex && nCurrentRoundIndex > 0 )
// 				{
// 					objCatchupChain.last_round_index = nCurrentRoundIndex;
// 				}

// 				//	...
// 				pfnNext();
// 			});
// 		},
// 		function( pfnNext )
// 		{
// 			//
// 			//	check if the peer really needs hash trees
// 			//
// 			_db.query
// 			(
// 				"SELECT is_stable FROM units WHERE is_on_main_chain=1 AND main_chain_index=?",
// 				[ last_known_mci ],
// 				function( rows )
// 				{
// 					if ( rows.length === 0 )
// 					{
// 						return pfnNext( "already_current" );
// 					}
// 					if ( rows[ 0 ].is_stable === 0 )
// 					{
// 						return pfnNext( "already_current" );
// 					}

// 					//	...
// 					pfnNext();
// 				}
// 			);
// 		},
// 		function( pfnNext )
// 		{
// 			//
// 			//	POW ADD
// 			//	2018/9/6 10:51 AM
// 			//	read last stable mc unit
// 			//
// 			_storage.readLastStableMcUnitProps( _db, function( objLastStableMcUnitProps )
// 			{
// 				if ( ! objLastStableMcUnitProps )
// 				{
// 					return pfnNext( `failed to read last stable mc unit.` );
// 				}

// 				//	...
// 				sLastBallUnit = objLastStableMcUnitProps.unit;
// 				pfnNext();
// 			});

// 			//
// 			//	POW DEL
// 			//	2018/9/6 10:42 AM
// 			//
// 			//
// 			// _witness_pow_proof.preparePowWitnessProof
// 			// (
// 			// 	last_stable_mci,
// 			// 	function( err, arrUnstableMcJoints, _last_ball_unit, _last_ball_mci )
// 			// 	{
// 			// 		if ( err )
// 			// 		{
// 			// 			return cb( err );
// 			// 		}
// 			//
// 			// 		//	...
// 			// 		objCatchupChain.unstable_mc_joints = arrUnstableMcJoints;
// 			//
// 			// 		/**
// 			// 		 *	POW DEL
// 			// 		 */
// 			// 		// if ( arrWitnessChangeAndDefinitionJoints.length > 0 )
// 			// 		// {
// 			// 		// 	objCatchupChain.witness_change_and_definition_joints = arrWitnessChangeAndDefinitionJoints;
// 			// 		// }
// 			//
// 			// 		sLastBallUnit = _last_ball_unit;
// 			// 		cb();
// 			// 	}
// 			// );
// 		},
// 		function( pfnNext )
// 		{
// 			//
// 			//	jump by last_ball references until we land on or behind last_stable_mci
// 			//
// 			if ( ! sLastBallUnit )
// 			{
// 				return pfnNext();
// 			}

// 			goUp( sLastBallUnit );

// 			//
// 			//	goUp means going up along its last_ball_unit
// 			//
// 			//	current joint -> unit.last_ball_unit
// 			//
// 			function goUp( unit )
// 			{
// 				_storage.readJointWithBall( _db, unit, function( objJoint )
// 				{
// 					//
// 					//	push
// 					//	objJoint { unit, ball }
// 					//
// 					objCatchupChain.stable_last_ball_joints.push( objJoint );

// 					//	...
// 					_storage.readUnitProps( _db, unit, function( objUnitProps )
// 					{
// 						( objUnitProps.main_chain_index <= last_stable_mci )
// 							? pfnNext()
// 							: goUp( objJoint.unit.last_ball_unit );
// 					});
// 				});
// 			}
// 		}
// 	], function( err )
// 	{
// 		if ( err === "already_current" )
// 		{
// 			return callbacks.ifOk( { status : "current" } );
// 		}
// 		if ( err )
// 		{
// 			return callbacks.ifError( err );
// 		}

// 		//	...
// 		callbacks.ifOk( objCatchupChain );
// 	});
// }

function prepareCatchupChain( catchupRequest, callbacks )
{
	let last_stable_mci	= catchupRequest.last_stable_mci;
	let last_known_mci	= catchupRequest.last_known_mci;

	if ( typeof last_stable_mci !== "number" )
	{
		return callbacks.ifError( "no last_stable_mci" );
	}
	if ( typeof last_known_mci !== "number" )
	{
		return callbacks.ifError( "no last_known_mci" );
	}

	let objCatchupChain = {
		last_round_index			: null,	//	POW ADD @2018/10/9 4:30 PM  by Liu Qixing
		last_main_chain_index       : null, //  ADD by ZhangT @2019/2/25
		stable_last_ball_joints			: [],
	};
	
	let sLastBallMci    = 0; 
	
	_async.series
	([
		function( pfnNext )
		{
			//
			//	get current round index
			//
			_round.getCurrentRoundIndex( null, function( nCurrentRoundIndex )
			{
				if ( 'number' === typeof nCurrentRoundIndex && nCurrentRoundIndex > 0 )
				{
					objCatchupChain.last_round_index = nCurrentRoundIndex;
				}

				//	...
				pfnNext();
			});
		},
		function( pfnNext )
		{
			//
			//	get current main chain index
			//
			_storage.getMaxTrustMeMci( null, function( main_chain_index )
			{
				if ( 'number' === typeof main_chain_index && main_chain_index > 0 )
				{
					objCatchupChain.last_main_chain_index = main_chain_index;
				}

				//	...
				pfnNext();
			});
		},
		function( pfnNext )
		{
			//
			//	check if the peer really needs hash trees
			//
			_db.query
			(
				"SELECT is_stable FROM units WHERE is_on_main_chain=1 AND main_chain_index=?",
				[ last_known_mci ],
				function( rows )
				{
					if ( rows.length === 0 )
					{
						return pfnNext( "already_current" );
					}
					if ( rows[ 0 ].is_stable === 0 )
					{
						return pfnNext( "already_current" );
					}

					//	...
					pfnNext();
				}
			);
		},
		function( pfnNext )
		{
			_storage.readLastStableMcIndex( _db, function( lastStableMci )
			{
				if ( ! lastStableMci || lastStableMci === 0 )
				{
					return pfnNext( `failed to read last stable mc unit.` );
				}
				sLastBallMci = lastStableMci;
				pfnNext();
			});
		},
		function( pfnNext )
		{
			//
			//	jump by last_ball references until we land on or behind last_stable_mci
			//
			if ( sLastBallMci === 0 || typeof sLastBallMci !== "number" )
			{
				return pfnNext( `current last stable mci is not number.` );
			}
			if(last_stable_mci > sLastBallMci)
			{
				return pfnNext('already_current');
			}

			goDown( last_stable_mci );

			function goDown( currentMci )
			{
				if ( typeof currentMci !== "number" )
				{
					return pfnNext( `current mci is not number.` );
				}
				
				_storage.readUnitPropsBystableMci( _db, currentMci, function( currentUnit )
				{
					if ( ! currentUnit )
					{
						return pfnNext( `failed to read stable mc unit.` );
					}
					_storage.readJointWithBall( _db, currentUnit, function( objJoint )
					{
						objCatchupChain.stable_last_ball_joints.push( objJoint );
						if(objCatchupChain.stable_last_ball_joints.length > _conf.CATCHUP_MAX_CHAIN_BALLS)
						{
							return pfnNext();
						}
						if(currentMci === sLastBallMci)
						{
							return pfnNext();
						}
						var nextMci = currentMci + _conf.CATCHUP_MCI_INTERVAL;
						if(nextMci > sLastBallMci)
						{
							return goDown(sLastBallMci);
						}
						goDown(nextMci);
					});
				});	
			}
		}
	], function( err )
	{
		if ( err === "already_current" )
		{
			return callbacks.ifOk( { status : "current" } );
		}
		if ( err )
		{
			return callbacks.ifError( err );
		}

		//	...
		callbacks.ifOk( objCatchupChain );
	});
}

// /**
//  *	process received catchup chain in client side
//  *
//  *	@param	{object}	catchupChain
//  *	@param	{string}	peer
//  *	@param	{object}	callbacks
//  *	@return {*}
//  */
// function processCatchupChainOld( catchupChain, peer, callbacks )
// {
// 	if ( catchupChain.status === "current" )
// 	{
// 		return callbacks.ifCurrent();
// 	}

// 	//
// 	//	POW DEL
// 	//	2018/9/6 10:46 AM
// 	//
// 	// if ( ! Array.isArray( catchupChain.unstable_mc_joints ) )
// 	// {
// 	// 	return callbacks.ifError( "no unstable_mc_joints" );
// 	// }

// 	if ( ! Array.isArray( catchupChain.stable_last_ball_joints ) )
// 	{
// 		return callbacks.ifError( "no stable_last_ball_joints" );
// 	}
// 	if ( 0 === catchupChain.stable_last_ball_joints.length )
// 	{
// 		return callbacks.ifError( "stable_last_ball_joints is empty" );
// 	}
// 	if ( 'object' !== typeof catchupChain.stable_last_ball_joints[ 0 ] )
// 	{
// 		return callbacks.ifError( "stable_last_ball_joints is not a plain object." );
// 	}


// 	/**
// 	 *	POW ADD
// 	 *	update _nLastRoundIndexFromPeers
// 	 */
// 	updateLastRoundIndexFromPeers( catchupChain.last_round_index );


// 	/**
// 	 * 	POW MOD
// 	 *	stable joints
// 	 */
// 	let sLastBallUnit	= catchupChain.stable_last_ball_joints[ 0 ].unit.unit;
// 	let sLastBall		= catchupChain.stable_last_ball_joints[ 0 ].ball;
// 	let arrChainBalls	= [];

// 	for ( let i = 0; i < catchupChain.stable_last_ball_joints.length; i ++ )
// 	{
// 		let objJoint	= catchupChain.stable_last_ball_joints[ i ];
// 		let objUnit	= objJoint.unit;

// 		if ( ! objJoint.ball )
// 		{
// 			return callbacks.ifError( "stable but no ball" );
// 		}
// 		if ( ! _validation.hasValidHashes( objJoint ) )
// 		{
// 			return callbacks.ifError( "invalid hash" );
// 		}
// 		if ( objUnit.unit !== sLastBallUnit )
// 		{
// 			return callbacks.ifError( "not the last ball unit" );
// 		}
// 		if ( objJoint.ball !== sLastBall )
// 		{
// 			return callbacks.ifError("not the last ball");
// 		}
// 		if ( objUnit.last_ball_unit )
// 		{
// 			sLastBallUnit	= objUnit.last_ball_unit;
// 			sLastBall	= objUnit.last_ball;
// 		}

// 		arrChainBalls.push( objJoint.ball );
// 	}

// 	//
// 	//	* VERY IMPORTANT
// 	//	objJoints in arrChainBalls will sort by main_chain_index ASC after arrChainBalls.reverse()
// 	//
// 	arrChainBalls.reverse();


// 	//	...
// 	let unlock = null;
// 	_async.series
// 	([
// 		function( cb )
// 		{
// 			_mutex.lock
// 			(
// 				[ 'catchup_chain' ],
// 				function( _unlock )
// 				{
// 					unlock = _unlock;
// 					_db.query
// 					(
// 						"SELECT 1 FROM catchup_chain_balls LIMIT 1",
// 						function( rows )
// 						{
// 							( rows.length > 0 ) ? cb( "duplicate" ) : cb();
// 						}
// 					);
// 				}
// 			);
// 		},
// 		function( cb )
// 		{
// 			//
// 			//	ADJUST first chain ball if necessary
// 			// 	and make sure it is the only stable unit in the entire chain
// 			//
// 			_db.query
// 			(
// 				"SELECT is_stable, is_on_main_chain, main_chain_index FROM balls JOIN units USING(unit) WHERE ball=?",
// 				[ arrChainBalls[ 0 ] ],
// 				function( rows )
// 				{
// 					if ( 0 === rows.length )
// 					{
// 						if ( _storage.isGenesisBall( arrChainBalls[ 0 ] ) )
// 						{
// 							return cb();
// 						}

// 						return cb( `first chain ball ${ arrChainBalls[ 0 ] } is not known` );
// 					}

// 					let objFirstChainBallProps	= rows[0];
// 					if ( objFirstChainBallProps.is_stable !== 1 )
// 					{
// 						return cb( "first chain ball "+arrChainBalls[0]+" is not stable" );
// 					}
// 					if ( objFirstChainBallProps.is_on_main_chain !== 1 )
// 					{
// 						return cb( `first chain ball ${ arrChainBalls[0] } is not on mc` );
// 					}

// 					_storage.readLastStableMcUnitProps( _db, function( objLastStableMcUnitProps )
// 					{
// 						let last_stable_mci	= objLastStableMcUnitProps.main_chain_index;
// 						if ( objFirstChainBallProps.main_chain_index > last_stable_mci )
// 						{
// 							//	duplicate check
// 							return cb( `first chain ball ${ arrChainBalls[0] } mci is too large` );
// 						}
// 						if ( objFirstChainBallProps.main_chain_index === last_stable_mci )
// 						{
// 							//	exact match
// 							return cb();
// 						}

// 						//	replace to avoid receiving duplicates
// 						arrChainBalls[ 0 ]	= objLastStableMcUnitProps.ball;
// 						if ( ! arrChainBalls[ 1 ] )
// 						{
// 							return cb();
// 						}

// 						_db.query
// 						(
// 							"SELECT is_stable FROM balls JOIN units USING(unit) WHERE ball=?",
// 							[ arrChainBalls[ 1 ] ],
// 							function( rows2 )
// 							{
// 								if ( 0 === rows2.length )
// 								{
// 									return cb();
// 								}

// 								let objSecondChainBallProps = rows2[0];
// 								if ( 1 === objSecondChainBallProps.is_stable )
// 								{
// 									return cb( `second chain ball ${ arrChainBalls[1] } must not be stable` );
// 								}

// 								//	...
// 								cb();
// 							}
// 						);
// 					});
// 				}
// 			);
// 		},
// 		function( cb )
// 		{
// 			//
// 			//	_validation complete, now write the chain for future downloading of hash trees
// 			//
// 			let arrValues = arrChainBalls.map( function( ball ){ return "(" + _db.escape( ball ) + ")"; } );
// 			_db.query
// 			(
// 				"INSERT INTO catchup_chain_balls (ball) VALUES " + arrValues.join( ', ' ), function()
// 				{
// 					cb();
// 				}
// 			);
// 		}
// 	], function( err )
// 	{
// 		unlock();
// 		err ? callbacks.ifError( err ) : callbacks.ifOk();
// 	});
// }

function processCatchupChain( catchupChain, peer, callbacks )
{
	if ( catchupChain.status === "current" )
	{
		return callbacks.ifCurrent();
	}

	//
	//	POW DEL
	//	2018/9/6 10:46 AM
	//
	// if ( ! Array.isArray( catchupChain.unstable_mc_joints ) )
	// {
	// 	return callbacks.ifError( "no unstable_mc_joints" );
	// }

	if ( ! Array.isArray( catchupChain.stable_last_ball_joints ) )
	{
		return callbacks.ifError( "no stable_last_ball_joints" );
	}
	if ( 0 === catchupChain.stable_last_ball_joints.length )
	{
		return callbacks.ifError( "stable_last_ball_joints is empty" );
	}
	if ( 'object' !== typeof catchupChain.stable_last_ball_joints[ 0 ] )
	{
		return callbacks.ifError( "stable_last_ball_joints is not a plain object." );
	}


	/**
	 *	POW ADD
	 *	update _nLastRoundIndexFromPeers
	 */
	updateLastRoundIndexFromPeers( catchupChain.last_round_index, catchupChain.last_main_chain_index );


	/**
	 * 	POW MOD
	 *	stable joints
	 */
	// let sLastBallUnit	= catchupChain.stable_last_ball_joints[ 0 ].unit.unit;
	// let sLastBall		= catchupChain.stable_last_ball_joints[ 0 ].ball;
	let arrChainBalls	= [];

	for ( let i = 0; i < catchupChain.stable_last_ball_joints.length; i ++ )
	{
		let objJoint	= catchupChain.stable_last_ball_joints[ i ];
		let objUnit	= objJoint.unit;

		if ( ! objJoint.ball )
		{
			return callbacks.ifError( "stable but no ball" );
		}
		if ( ! _validation.hasValidHashes( objJoint ) )
		{
			return callbacks.ifError( "invalid hash" );
		}
		// if ( objUnit.unit !== sLastBallUnit )
		// {
		// 	return callbacks.ifError( "not the last ball unit" );
		// }
		// if ( objJoint.ball !== sLastBall )
		// {
		// 	return callbacks.ifError("not the last ball");
		// }
		// if ( objUnit.last_ball_unit )
		// {
		// 	sLastBallUnit	= objUnit.last_ball_unit;
		// 	sLastBall	= objUnit.last_ball;
		// }

		arrChainBalls.push( objJoint.ball );
	}

	//
	//	* VERY IMPORTANT
	//	objJoints in arrChainBalls will sort by main_chain_index ASC after arrChainBalls.reverse()
	//
	// arrChainBalls.reverse();


	//	...
	let unlock = null;
	_async.series
	([
		function( cb )
		{
			_mutex.lock
			(
				[ 'catchup_chain' ],
				function( _unlock )
				{
					unlock = _unlock;
					_db.query
					(
						"SELECT 1 FROM catchup_chain_balls LIMIT 1",
						function( rows )
						{
							( rows.length > 0 ) ? cb( "duplicate" ) : cb();
						}
					);
				}
			);
		},
		function( cb )
		{
			//
			//	ADJUST first chain ball if necessary
			// 	and make sure it is the only stable unit in the entire chain
			//
			_db.query
			(
				"SELECT is_stable, is_on_main_chain, main_chain_index FROM balls JOIN units USING(unit) WHERE ball=?",
				[ arrChainBalls[ 0 ] ],
				function( rows )
				{
					if ( 0 === rows.length )
					{
						if ( _storage.isGenesisBall( arrChainBalls[ 0 ] ) )
						{
							return cb();
						}

						return cb( `first chain ball ${ arrChainBalls[ 0 ] } is not known` );
					}

					let objFirstChainBallProps	= rows[0];
					if ( objFirstChainBallProps.is_stable !== 1 )
					{
						return cb( "first chain ball "+arrChainBalls[0]+" is not stable" );
					}
					if ( objFirstChainBallProps.is_on_main_chain !== 1 )
					{
						return cb( `first chain ball ${ arrChainBalls[0] } is not on mc` );
					}

					_storage.readLastStableMcUnitProps( _db, function( objLastStableMcUnitProps )
					{
						let last_stable_mci	= objLastStableMcUnitProps.main_chain_index;
						if ( objFirstChainBallProps.main_chain_index > last_stable_mci )
						{
							//	duplicate check
							return cb( `first chain ball ${ arrChainBalls[0] } mci is too large` );
						}
						if ( objFirstChainBallProps.main_chain_index === last_stable_mci )
						{
							//	exact match
							return cb();
						}

						//	replace to avoid receiving duplicates
						arrChainBalls[ 0 ]	= objLastStableMcUnitProps.ball;
						if ( ! arrChainBalls[ 1 ] )
						{
							return cb();
						}

						_db.query
						(
							"SELECT is_stable FROM balls JOIN units USING(unit) WHERE ball=?",
							[ arrChainBalls[ 1 ] ],
							function( rows2 )
							{
								if ( 0 === rows2.length )
								{
									return cb();
								}

								let objSecondChainBallProps = rows2[0];
								if ( 1 === objSecondChainBallProps.is_stable )
								{
									return cb( `second chain ball ${ arrChainBalls[1] } must not be stable` );
								}

								//	...
								cb();
							}
						);
					});
				}
			);
		},
		function( cb )
		{
			//
			//	_validation complete, now write the chain for future downloading of hash trees
			//
			let arrValues = arrChainBalls.map( function( ball ){ return "(" + _db.escape( ball ) + ")"; } );
			_db.query
			(
				"INSERT INTO catchup_chain_balls (ball) VALUES " + arrValues.join( ', ' ), function()
				{
					cb();
				}
			);
		}
	], function( err )
	{
		unlock();
		err ? callbacks.ifError( err ) : callbacks.ifOk();
	});
}

/**
 *	read hash tree
 *	@param	{object}	hashTreeRequest
 *	@param	{object}	callbacks
 *	@return {*}
 */
function readHashTree( hashTreeRequest, callbacks )
{
	let from_ball	= hashTreeRequest.from_ball;
	let to_ball	= hashTreeRequest.to_ball;

	if ( 'string' !== typeof from_ball )
	{
		return callbacks.ifError( "no from_ball" );
	}
	if ( 'string' !== typeof to_ball )
	{
		return callbacks.ifError( "no to_ball" );
	}

	let from_mci;
	let to_mci;

	_db.query
	(
		"SELECT is_stable, is_on_main_chain, main_chain_index, ball FROM balls JOIN units USING(unit) WHERE ball IN(?,?)", 
		[ from_ball, to_ball ],
		function( rows )
		{
			if ( rows.length !== 2 )
			{
				return callbacks.ifError( "some balls not found" );
			}

			for ( let i = 0; i < rows.length; i++ )
			{
				let props = rows[ i ];
				if ( props.is_stable !== 1 )
				{
					return callbacks.ifError( "some balls not stable" );
				}
				if ( props.is_on_main_chain !== 1 )
				{
					return callbacks.ifError( "some balls not on mc" );
				}

				if ( props.ball === from_ball )
				{
					from_mci = props.main_chain_index;
				}
				else if ( props.ball === to_ball )
				{
					to_mci = props.main_chain_index;
				}
			}

			if ( from_mci >= to_mci )
			{
				return callbacks.ifError( "from is after to" );
			}

			let arrBalls = [];
			let op = ( from_mci === 0 ) ? ">=" : ">";	//	if starting from 0, add genesis itself

			_db.query
			(
				"SELECT unit, ball, content_hash FROM units LEFT JOIN balls USING(unit) \n\
				WHERE main_chain_index " + op + " ? AND main_chain_index<=? ORDER BY `level`",
				[ from_mci, to_mci ],
				function( ball_rows )
				{
					_async.eachSeries
					(
						ball_rows,
						function( objBall, cb )
						{
							if ( ! objBall.ball )
							{
								throw Error( "no ball for unit " + objBall.unit );
							}
							if ( objBall.content_hash )
							{
								objBall.is_nonserial = true;
							}

							//	...
							delete objBall.content_hash;

							_db.query
							(
								"SELECT ball FROM parenthoods LEFT JOIN balls ON parent_unit=balls.unit WHERE child_unit=? ORDER BY ball", 
								[ objBall.unit ],
								function( parent_rows )
								{
									if ( parent_rows.some(function(parent_row){ return ! parent_row.ball; }))
									{
										throw Error( "some parents have no balls" );
									}
									if ( parent_rows.length > 0 )
									{
										objBall.parent_balls = parent_rows.map(function(parent_row){ return parent_row.ball; });
									}

									//
									//	just collect skiplist balls
									//
									_db.query
									(
										"SELECT ball FROM skiplist_units LEFT JOIN balls ON skiplist_unit=balls.unit WHERE skiplist_units.unit=? ORDER BY ball", 
										[ objBall.unit ],
										function( srows )
										{
											if ( srows.some(function(srow){ return ! srow.ball; }))
											{
												throw Error("some skiplist units have no balls");
											}
											if ( srows.length > 0)
											{
												objBall.skiplist_balls = srows.map(function(srow){ return srow.ball; });
											}

											//	...
											arrBalls.push( objBall );

											//	...
											cb();
										}
									);
								}
							);
						},
						function()
						{
							callbacks.ifOk( arrBalls );
						}
					);
				}
			);
		}
	);
}

function processHashTree( arrBalls, callbacks )
{
	if ( ! Array.isArray( arrBalls ) )
	{
		return callbacks.ifError( "no balls array" );
	}

	_mutex.lock( [ "hash_tree" ], function( unlock )
	{
		_db.takeConnectionFromPool( function( conn )
		{
			conn.query( "BEGIN", function()
			{
				// let max_mci = null;
				_async.eachSeries
				(
					arrBalls,
					function( objBall, cb )
					{
						if (typeof objBall.ball !== "string" )
						{
							return cb( "no ball" );
						}
						if (typeof objBall.unit !== "string")
						{
							return cb( "no unit" );
						}
						if ( ! _storage.isGenesisUnit( objBall.unit ) )
						{
							if ( ! Array.isArray( objBall.parent_balls ) )
							{
								return cb( "no parents" );
							}
						}
						else if ( objBall.parent_balls )
						{
							return cb( "genesis with parents?" );
						}

						if ( objBall.ball !== _object_hash.getBallHash( objBall.unit, objBall.parent_balls, objBall.skiplist_balls, objBall.is_nonserial ) )
						{
							return cb( `wrong ball hash, ball ${ objBall.ball }, unit ${ objBall.unit }` );
						}

						function addBall()
						{
							// insert even if it already exists in balls, because we need to define max_mci by looking outside this hash tree
							conn.query
							(
								"INSERT " + conn.getIgnore() + " INTO hash_tree_balls (ball, unit) VALUES(?,?)",
								[ objBall.ball, objBall.unit ],
								function()
								{
									cb();
									//console.log("inserted unit "+objBall.unit, objBall.ball);
								}
							);
						}

						function checkSkiplistBallsExist()
						{
							if ( ! objBall.skiplist_balls )
							{
								return addBall();
							}

							conn.query
							(
								"SELECT ball FROM hash_tree_balls WHERE ball IN(?) UNION SELECT ball FROM balls WHERE ball IN(?)",
								[ objBall.skiplist_balls, objBall.skiplist_balls ],
								function( rows )
								{
									if ( rows.length !== objBall.skiplist_balls.length )
									{
										return cb( "some skiplist balls not found" );
									}

									//	...
									addBall();
								}
							);
						}

						if ( ! objBall.parent_balls )
						{
							return checkSkiplistBallsExist();
						}

						conn.query( "SELECT ball FROM hash_tree_balls WHERE ball IN(?)", [ objBall.parent_balls ], function( rows )
						{
							//	console.log(rows.length+" rows", objBall.parent_balls);
							if ( rows.length === objBall.parent_balls.length )
							{
								return checkSkiplistBallsExist();
							}

							let arrFoundBalls	= rows.map( function( row ) { return row.ball; } );
							let arrMissingBalls	= _.difference( objBall.parent_balls, arrFoundBalls );

							/**
							 *	POW COMMENT
							 *	@author		XING
							 *	@datetime	2018/8/3 5:55 PM
							 *	@description	try to obtain pair of unit-ball from units and then save them to hash_tree_balls
							 */
							conn.query
							(
								"SELECT ball, main_chain_index, is_on_main_chain FROM balls JOIN units USING(unit) WHERE ball IN(?)",
								[ arrMissingBalls ],
								function( rows2 )
								{
									if ( rows2.length !== arrMissingBalls.length )
									{
										return cb( `some parents not found, unit ${ objBall.unit }` );
									}
									
									// for ( let i = 0; i < rows2.length; i++ )
									// {
									// 	let props = rows2[ i ];
									// 	if ( props.is_on_main_chain === 1 && ( props.main_chain_index > max_mci || max_mci === null ) )
									// 	{
									// 		max_mci = props.main_chain_index;
									// 	}
									// }

									//	...
									checkSkiplistBallsExist();
								}
							);
						});
					},
					function( error )
					{
						function finish( err )
						{
							conn.query( err ? "ROLLBACK" : "COMMIT", function()
							{
								conn.release();
								unlock();
								err ? callbacks.ifError(err) : callbacks.ifOk();
							});
						}

						if ( error )
						{
							return finish( error );
						}

						// it is ok that max_mci === null as the 2nd tree does not touch finished balls
						//if (max_mci === null && !_storage.isGenesisUnit(arrBalls[0].unit))
						//    return finish("max_mci not defined");

						//	check that the received tree matches the first pair of chain elements
						conn.query
						(
							"SELECT ball, main_chain_index \n\
							FROM catchup_chain_balls LEFT JOIN balls USING(ball) LEFT JOIN units USING(unit) \n\
							ORDER BY member_index LIMIT 2",
							function( rows )
							{
								if ( rows.length !== 2 )
								{
									return finish( "expecting to have 2 elements in the chain" );
								}

								// removed: the main chain might be rebuilt if we are sending new units while syncing
								//	if (max_mci !== null && rows[0].main_chain_index !== null && rows[0].main_chain_index !== max_mci)
								//		return finish("max mci doesn't match first chain element: max mci = "+max_mci+", first mci = "+rows[0].main_chain_index);
								if ( rows[ 1 ].ball !== arrBalls[ arrBalls.length - 1 ].ball )
								{
									return finish( "tree root doesn't match second chain element" );
								}

								//
								//	remove the last chain element, we now have hash tree instead
								//
								conn.query( "DELETE FROM catchup_chain_balls WHERE ball=?", [ rows[ 0 ].ball ], function()
								{
									purgeHandledBallsFromHashTree( conn, finish );
								});
							}
						);
					}
				);
			});
		});
	});
}

function purgeHandledBallsFromHashTree( conn, onDone )
{
	conn.query( "SELECT ball FROM hash_tree_balls CROSS JOIN balls USING(ball)", function( rows )
	{
		if ( rows.length === 0 )
		{
			return onDone();
		}

		let arrHandledBalls = rows.map( function( row ){ return row.ball; } );
		conn.query
		(
			"DELETE FROM hash_tree_balls WHERE ball IN(?)",
			[ arrHandledBalls ],
			function()
			{
				onDone();
			}
		);
	});
}



/**
 * 	update last round index from all outbound peers
 *	@return	{void}
 */
function updateLastRoundIndexFromPeers( nLastRoundIndex, nLastMainChainIndex )
{
	if ( 'number' === typeof nLastRoundIndex && nLastRoundIndex > 0 &&
		 'number' === typeof nLastMainChainIndex && nLastMainChainIndex > 0 )
	{
		if ( null === _nLastRoundIndexFromPeers || nLastRoundIndex > _nLastRoundIndexFromPeers ||
			 null === _nLastMainChainIndexFromPeers || nLastMainChainIndex > _nLastMainChainIndexFromPeers )
		{
			_nLastRoundIndexFromPeers = nLastRoundIndex;
			_nLastMainChainIndexFromPeers = nLastMainChainIndex;
			_event_bus.emit( 'updated_last_round_index_from_peers', _nLastRoundIndexFromPeers, _nLastMainChainIndexFromPeers );
		}
	}
}


/**
 * 	get last round index from all outbound peers
 *	@return	{number}
 */
function getLastRoundIndexFromPeers()
{
	return _nLastRoundIndexFromPeers;
}






/**
 *	@exports
 */
exports.prepareCatchupChain		= prepareCatchupChain;
exports.processCatchupChain		= processCatchupChain;
exports.readHashTree			= readHashTree;
exports.processHashTree			= processHashTree;
exports.purgeHandledBallsFromHashTree	= purgeHandledBallsFromHashTree;

exports.updateLastRoundIndexFromPeers	= updateLastRoundIndexFromPeers;
exports.getLastRoundIndexFromPeers	= getLastRoundIndexFromPeers;
