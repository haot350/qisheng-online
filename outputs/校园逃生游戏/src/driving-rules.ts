import {RankingDriveScore} from './ranking/shared.ts';
import {DRIVING_TUNING} from './driving-tuning.ts';
/** v1.2 arcade challenge: simulation time only, independent of rendering/UI. */
export const DRIVE_RULES=Object.freeze({round:300,countdown:3,grace:10,durability:400,damageScale:.25,maxSpeed:DRIVING_TUNING.normalSpeed,reverseSpeed:DRIVING_TUNING.reverseSpeed,boostSpeed:DRIVING_TUNING.boostSpeed,boostDuration:3,boostCooldown:12,minimumImpactSpeed:3,stun:10,baseScore:100,comboWindow:20,maxCombo:4,repairAmount:200,repairDuration:3,repairSpeed:.5,repairRadius:3.5,resetDuration:2,resetPenalty:50,guideInterval:20});
export class DriveScore extends RankingDriveScore {}
export class DriveBoost {
 left=0;cooldown=0;
 trigger(){if(this.left>0||this.cooldown>0)return false;this.left=DRIVE_RULES.boostDuration;return true;}
 update(dt:number){if(this.left>0){this.left=Math.max(0,this.left-dt);if(this.left===0)this.cooldown=DRIVE_RULES.boostCooldown;}else this.cooldown=Math.max(0,this.cooldown-dt);}
}
