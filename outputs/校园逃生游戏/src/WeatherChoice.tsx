import {MenuChoice} from './MenuChoice';
import {WEATHER_PRESETS,WEATHER_VISUALS,type WeatherPreset} from '@qisheng/shared/weather';
import './weather-choice.css';
export function WeatherChoice({value,onChange,disabled=false}:{value:WeatherPreset;onChange:(value:WeatherPreset)=>void;disabled?:boolean}){
 return <div className="weather-choice"><MenuChoice label="天气" purpose="weather" value={value} disabled={disabled} onChange={onChange} options={WEATHER_PRESETS.map(preset=>({value:preset,label:WEATHER_VISUALS[preset].label}))}/></div>;
}
export function RoomWeather({preset}:{preset:WeatherPreset}){return <div className="weather-choice is-readonly"><span>本局天气</span><strong>{WEATHER_VISUALS[preset].label}</strong></div>;}
