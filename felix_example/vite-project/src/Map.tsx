import {DeckGL} from "@deck.gl/react/typed";
import {FirstPersonController, FirstPersonView, MapController, MapView} from "@deck.gl/core/typed";
import {useCallback, useEffect, useState} from "react";
import MapLayer from "./MapLayer";
import PitchViewer from "./PitchViewer";
import {ScenegraphLayer} from '@deck.gl/mesh-layers';
import ModelarController from './ModelarController'
export default () => {

    const INITIAL_VIEW_STATE = {
        "main": {
            "position": [
              0,0,100
            ],
            "bearing": 0,
            "pitch": 25,
            "minPitch": -90,
            "maxPitch": 90,
            "longitude": -100,
            "latitude": 40,
            zoom : 20
        },
        "minimap": {
            "longitude": -100,
            "latitude": 40,
           "zoom": 15,
            minPitch : 0,
            maxPitch: 80

        }
    };

    const [, setSizeScale] = useState(1.5);

    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

    const [currentSegment, setCurrentSegment] = useState('');

    const handleWheel = useCallback((e) => {
        if (currentSegment === 'Altitude') {
            // Adjust the scale factor as per your need

            const scaleFactor = -0.1;
            const deltaY = -e.deltaY * scaleFactor;
            const deltaX = e.deltaX * scaleFactor;

            setViewState(prevState => {

                // Convert bearing to radians
                const bearingInRadians = prevState.main.bearing * Math.PI / 180;

                // Calculate adjustment factor for the x-coordinate (position[0])
                const adjustmentFactor = Math.cos(bearingInRadians);

                let newAltitude = prevState.main.position[2] - deltaY;
                let newPosition0 = prevState.main.position[0] - deltaX * adjustmentFactor;

                newAltitude = Math.max(newAltitude, 1); // Ensure altitude doesn't go below 1

                return {
                    ...prevState,
                    main: {
                        ...prevState.main,
                        position: [newPosition0, prevState.main.position[1], newAltitude],
                    }
                };
            });
        }
    }, [currentSegment]);

    // Function to update segment based on mouse position
    const handleMouseMove = useCallback((e) => {
        const pageHeight = window.innerHeight;
        const mouseY = e.clientY;
        const mouseX = e.clientX;

        // Define the bounds of the 300px by 300px box
        const boxTop = 0; // Adjust as needed
        const boxLeft = 0; // Adjust as needed
        const boxRight = 300; // 300px width
        const boxBottom = 300; // 300px height

        // Check if the mouse is within the bounds of the box
        if (mouseX >= boxLeft && mouseX <= boxRight && mouseY >= boxTop && mouseY <= boxBottom) {
            setCurrentSegment('topDown');
        } else if (mouseY < pageHeight / 4) {
            setCurrentSegment('Altitude');
        } else {
            setCurrentSegment('FPController');
        }
    }, []);

    // Add and remove the mouse move event listener
    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, [handleMouseMove]);

    useEffect(() => {
        window.addEventListener('wheel', handleWheel);
        return () => {
            window.removeEventListener('wheel', handleWheel);
        };
    }, [handleWheel]);

    function layerFilter({layer, viewport}) {
        const shouldDrawInMinimap = layer.id.startsWith('bnw') || layer.id.startsWith('church');
        if (viewport.id === 'minimap') return shouldDrawInMinimap;
        if (viewport.id === 'main') return shouldDrawInMinimap;
       // return !shouldDrawInMinimap;
    }

    const mainView = new FirstPersonView({id: 'main',

        x: 20,

        controller : currentSegment === 'Altitude'? false : { type: FirstPersonController,
            setSizeScale: setSizeScale,
            keyboard: {
                moveSpeed: 0.5,
                zoomSpeed: 0.005,
                rotateSpeedX: 0.05,
                rotateSpeedY: 0.05
            }
        }});
    const minimapView = new MapView({
        id: 'minimap',
        x: 5,
        y: 5,
        width: '300px',
        height: '300px',
        clear: true,
        controller :  true,

        //controller : true,
        // controller: { type: MapController }
    });

    const onViewStateChange = useCallback((p) => {


        const {oldViewState, viewState: newViewState} = p;
        //stop us going underground
        const pos = newViewState.position;
        if (newViewState.position[2] < 1) {
            pos[2] = 1;
        }

        setViewState(() => ({
            main: {
                longitude:newViewState.longitude,
                latitude:newViewState.latitude,
                bearing : newViewState.bearing,
                pitch : newViewState.pitch,// < 0? 0 : newViewState.pitch,
                position : pos,
            },
            minimap: {
                longitude: newViewState.longitude,
                latitude: newViewState.latitude,
                bearing : newViewState.bearing,
                zoom : newViewState.zoom || 16,
                pitch : newViewState.pitch < 0? 0 : newViewState.pitch,
                position : newViewState.position,
            }
        }));
    }, []);


    return <DeckGL

        layers={[
            new MapLayer({id :'bnw', desaturate  : 1}),
            new MapLayer({id :'color', desaturate  : 0.5}),
            new ScenegraphLayer({
                id: 'church',
                data : [{coordinates : [-100, 40]}],
                pickable: true,
                scenegraph: '/throne_room.glb',
                getPosition: d => d.coordinates,
                getOrientation: d => [0, 90, 90],

                sizeScale: 1,
                _lighting: 'pbr'
            })
        ]}

       layerFilter={layerFilter}
        views={[mainView, minimapView]}
        viewState={viewState}
        onViewStateChange={onViewStateChange}

    >

        <pre style={{'marginTop' : '100px'}}>
                {JSON.stringify(viewState, null, 2)}
        </pre>

        <div style={{ "boxShadow": "0px 0px 10px 1px rgba(0, 0, 0, 0.5)",  top : 5, left : 5,width : '300px', height : '300px', position:'absolute'}}/>

        <div style={{ position: 'absolute', bottom: 20, left: 20, color: 'black' }}>
          <PitchViewer pitch={90+viewState.main.pitch} />
        </div>

        <div style={{ position: 'absolute', bottom: 20, left: 20, color: 'black' }}>
            Current Mode: {currentSegment}
        </div>
    </DeckGL>
}
