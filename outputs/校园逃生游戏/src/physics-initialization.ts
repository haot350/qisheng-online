import RAPIER from '@dimforge/rapier3d-compat';
import {init as initNavigation} from 'recast-navigation';
import {retryableInitialization} from './preparation-lifecycle.ts';
// Keep each module's successful or in-flight initialization when the other rejects.
const initializeRapier=retryableInitialization(()=>RAPIER.init());
const initializeNavigation=retryableInitialization(()=>initNavigation());
export function initializeGamePhysics(){return Promise.all([initializeRapier(),initializeNavigation()]);}
