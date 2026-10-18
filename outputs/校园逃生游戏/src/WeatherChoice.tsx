import {useId} from 'react';
import {WEATHER_PRESETS,WEATHER_VISUALS,type WeatherPreset} from '@qisheng/shared/weather';
import './weather-choice.css';
export function WeatherChoice({value,onChange,disabled=false}:{value:WeatherPreset;onChange:(value:WeatherPreset)=>void;disabled?:boolean}){
 const id=useId();return <div className="weather-choice"><label htmlFor={id}>天气</label><select id={id} aria-label="天气" value={value} disabled={disabled} onChange={event=>onChange(event.target.value as WeatherPreset)}>{WEATHER_PRESETS.map(preset=><option value={preset} key={preset}>{WEATHER_VISUALS[preset].label}</option>)}</select></div>;
}
export function RoomWeather({preset}:{preset:WeatherPreset}){return <div className="weather-choice is-readonly"><span>本局天气</span><strong>{WEATHER_VISUALS[preset].label}</strong></div>;}
