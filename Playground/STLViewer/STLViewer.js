/**
 * Created by admin on 2016/11/7.
 */

'use strict'

var container, stats;

var camera, cameraTarget, scene, renderer, orbitControl, clock, raycaster, mouse, helper, gui;

var refOffset = 1.8;

var table;

var gVar = {
    wireframe: false
    ,
};

/** begin main  */

init();
initGUI();
loadTable()
animate();

/** end main  */


function initGUI() {

    gui = new dat.GUI();
    var param = gui.addFolder( "Parameters" );
    param.add( gVar, 'wireframe' )

}

function mergeVertices() {

    var verticesMap = {}; // Hashmap for looking up vertices by position coordinates (and making sure they are unique)
    var unique = [], changes = [];

    var v, key;
    var precisionPoints = 2; // number of decimal points, e.g. 4 for epsilon of 0.001
    console.log("Truncates precision:  for epsilon of 0.001 ")
    var precision = Math.pow( 10, precisionPoints );
    var i, il, face;
    var indices, j, jl;

    for ( i = 0, il = this.vertices.length; i < il; i++ ) {

        v = this.vertices[ i ];
        key = Math.round( v.x * precision ) + '_' + Math.round( v.y * precision ) + '_' + Math.round( v.z * precision );

        if ( verticesMap[ key ] === undefined ) {

            verticesMap[ key ] = i;
            unique.push( this.vertices[ i ] );
            changes[ i ] = unique.length - 1;

        } else {

            //console.log('Duplicate vertex found. ', i, ' could be using ', verticesMap[key]);
            changes[ i ] = changes[ verticesMap[ key ] ];

        }

    }


    // if faces are completely degenerate after merging vertices, we
    // have to remove them from the geometry.
    var faceIndicesToRemove = [];

    for ( i = 0, il = this.faces.length; i < il; i++ ) {

        face = this.faces[ i ];

        face.a = changes[ face.a ];
        face.b = changes[ face.b ];
        face.c = changes[ face.c ];

        indices = [ face.a, face.b, face.c ];

        var dupIndex = -1;

        // if any duplicate vertices are found in a Face3
        // we have to remove the face as nothing can be saved
        for ( var n = 0; n < 3; n++ ) {

            if ( indices[ n ] === indices[ ( n + 1 ) % 3 ] ) {

                dupIndex = n;
                faceIndicesToRemove.push( i );
                break;

            }

        }

    }

    for ( i = faceIndicesToRemove.length - 1; i >= 0; i-- ) {

        var idx = faceIndicesToRemove[ i ];

        this.faces.splice( idx, 1 );

        for ( j = 0, jl = this.faceVertexUvs.length; j < jl; j++ ) {

            this.faceVertexUvs[ j ].splice( idx, 1 );

        }

    }

    // Use unique set of vertices

    var diff = this.vertices.length - unique.length;
    this.vertices = unique;
    return diff;

}

function extractOneMesh( mesh, facet ) {

    var meshFaces = new Set( mesh.geometry.faces );


    var seedMesh = [];
    var border = [];
    var vertexIdMask = [];


    function setMask( facet ) {
        vertexIdMask[ facet.a ] = true;
        vertexIdMask[ facet.b ] = true;
        vertexIdMask[ facet.c ] = true;
    }

    function isMaskIntersect( facet ) {
        return vertexIdMask[ facet.a ] || vertexIdMask[ facet.b ] || vertexIdMask[ facet.c ];
    }

    var VisibleMesh = new THREE.Geometry();

    setMask( facet );
    seedMesh.push( facet );
    border.push( facet );
    meshFaces.delete( facet );

    for ( ; 0 !== border.length; ) {
        var border = [];
        for ( var face of meshFaces ) {
            if ( true === isMaskIntersect( face ) ) {
                seedMesh.push( face );

                VisibleMesh.vertices.push(
                    (new THREE.Vector3()).copy( mesh.geometry.vertices[ face.a ] )
                    , (new THREE.Vector3()).copy( mesh.geometry.vertices[ face.b ] )
                    , (new THREE.Vector3()).copy( mesh.geometry.vertices[ face.c ] )
                );
                var indexOffset = VisibleMesh.vertices.length - 3;
                VisibleMesh.faces.push( new THREE.Face3( indexOffset, indexOffset + 1, indexOffset + 2 ) );
                border.push( face );
            }
        }

        for ( var i = 0, end = border.length; i < end; ++i ) {
            meshFaces.delete( border[ i ] );
            setMask( border[i] );
        }
    }
    VisibleMesh.computeFaceNormals();
    return VisibleMesh;
}


/** @param mesh: THREE.Geometry object */
function isolateMeshes( mesh ) {

    var meshFaces = new Set( mesh.geometry.faces );


    var seedMesh = [];
    var meshes = [];
    var border = [];
    var vertexIdMask = [];


    function setMask( facet ) {
        vertexIdMask[ facet.a ] = true;
        vertexIdMask[ facet.b ] = true;
        vertexIdMask[ facet.c ] = true;
    }

    function isMaskIntersect( facet ) {
        return vertexIdMask[ facet.a ] || vertexIdMask[ facet.b ] || vertexIdMask[ facet.c ];
    }

    var count = 0;

    for ( ; false === meshFaces.keys().next().done; ) {

        seedMesh = [];
        border = [];

        var nextFacet = meshFaces.values().next().value;
        if ( undefined === nextFacet ) {
            break;
        }
        setMask( nextFacet );
        seedMesh.push( nextFacet );
        border.push( nextFacet );
        meshFaces.delete( nextFacet );

        for ( ; 0 !== border.length; ) {
            var border = [];
            for ( var face of meshFaces ) {
                if ( true === isMaskIntersect( face ) ) {
                    seedMesh.push( face );
                    border.push( face );
                }
            }

            for ( var i = 0, end = border.length; i < end; ++i ) {
                meshFaces.delete( border[ i ] );
            }
        }
        meshes.push( seedMesh );
        console.log( "isolated no." + ( meshes.length + 1 ) + " mesh, it has " + seedMesh.length + " faces" );
    }

    return meshes;
}

function loadTable() {
    var loader = new THREE.STLLoader();
    loader.load( 'TestModels/mesh.stl', function ( geometry ) {


        var i, end, pos, newGeometry, indexVertex, numDeleted, rotator;

        pos = geometry.getAttribute( "position" );

        console.log("Old mesh has " + pos.array.length + " vertices ");
        newGeometry = new THREE.Geometry();
        rotator = new THREE.Euler( -Math.PI / 2, 0, 0, 'XYZ' );

        indexVertex = -1;

        for ( i = 0, end = pos.array.length; i < end; i += 9 ) {

            newGeometry.vertices.push(
                (new THREE.Vector3( pos.array[ i ], pos.array[ i + 1 ], pos.array[ i + 2 ] )).applyEuler( rotator )
                , (new THREE.Vector3( pos.array[ i + 3 ], pos.array[ i + 4 ], pos.array[ i + 5 ] )).applyEuler( rotator )
                , (new THREE.Vector3( pos.array[ i + 6 ], pos.array[ i + 7 ], pos.array[ i + 8 ] )).applyEuler( rotator )
            );

            newGeometry.faces.push( new THREE.Face3( ++indexVertex, ++indexVertex, ++indexVertex ) );
        }

        console.log("Old mesh has " + newGeometry.faces.length + " faces ");


        newGeometry.customMergeVertices = mergeVertices;

        numDeleted = newGeometry.customMergeVertices();
        console.log( numDeleted + " duplicate vertices deleted" );

        console.log("New mesh has " + newGeometry.vertices.length + " vertices ");
        console.log("New mesh has " + newGeometry.faces.length + " faces ");

        newGeometry.computeFaceNormals();
        newGeometry.computeVertexNormals( true );

        newGeometry.verticesNeedUpdate = true;
        newGeometry.elementsNeedUpdate = true;
        newGeometry.normalsNeedUpdate = true;


        var material = new THREE.MeshPhongMaterial( { color: 0xAAAAAA, specular: 0x111111, shininess: 200 } );
        var mesh = new THREE.Mesh( newGeometry, material );

        //TODO: Test isolating meshes
        // var meshes = isolateMeshes( mesh );

        //meshes.sort( ( a, b ) => a.length - b.length );

        mesh.position.set( 0, 0, 0 );
        //mesh.rotation.set( -Math.PI / 2, 0, 0 );
        //mesh.scale.set( 0.1, 0.1, 0.1 );

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        scene.add( mesh );

        table = mesh;

        document.getElementById("loading").style.display = 'none';

    } );

}

function init() {

    container = document.getElementById( 'webgl-output' );

    camera = new THREE.PerspectiveCamera( 35, window.innerWidth / window.innerHeight, 0.01, 150 );
    camera.position.set( 17, 17, 17 );

    cameraTarget = new THREE.Vector3( 0, -0.25, 0 );

    orbitControl = new THREE.OrbitControls( camera );
    orbitControl.target.set( 0, 0, 0 );
    orbitControl.autoRotate = false;

    clock = new THREE.Clock();

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog( 0x72645b, 3, 100 );

    // Axis helper
    var axes = new THREE.AxisHelper( 1 );
    axes.position.set( refOffset, 0, refOffset );
    scene.add( axes );

    // Ground

    var plane = new THREE.Mesh(
        new THREE.PlaneBufferGeometry( 40, 40 ),
        new THREE.MeshPhongMaterial( { color: 0x999999, specular: 0x101010 } )
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.5;
    scene.add( plane );

    plane.receiveShadow = true;


    // ASCII file

    var loader = new THREE.STLLoader();
    loader.load( '../../libs/models/stl/ascii/slotted_disk.stl', function ( geometry ) {

        var material = new THREE.MeshPhongMaterial( { color: 0xff5533, specular: 0x111111, shininess: 200 } );
        var mesh = new THREE.Mesh( geometry, material );

        mesh.position.set( 0, -0.25, 0.6 + refOffset );
        mesh.rotation.set( 0, -Math.PI / 2, 0 );
        mesh.scale.set( 0.5, 0.5, 0.5 );

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        scene.add( mesh );

    } );


    // Binary files

    var material = new THREE.MeshPhongMaterial( { color: 0xAAAAAA, specular: 0x111111, shininess: 200 } );

    loader.load( '../../libs/models/stl/binary/pr2_head_pan.stl', function ( geometry ) {

        var mesh = new THREE.Mesh( geometry, material );

        if ( !mesh ) console.warn( "no mesh loaded" );

        mesh.position.set( 0, -0.37, -0.6 + refOffset );
        mesh.rotation.set( -Math.PI / 2, 0, 0 );
        mesh.scale.set( 2, 2, 2 );

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        scene.add( mesh );

    } );

    loader.load( '../../libs/models/stl/binary/pr2_head_tilt.stl', function ( geometry ) {

        var mesh = new THREE.Mesh( geometry, material );

        mesh.position.set( 0.136, -0.37, -0.6 + refOffset );
        mesh.rotation.set( -Math.PI / 2, 0.3, 0 );
        mesh.scale.set( 2, 2, 2 );

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        scene.add( mesh );

    } );

    // Colored binary STL
    loader.load( '../../libs/models/stl/binary/colored.stl', function ( geometry ) {

        var meshMaterial = material;
        if ( geometry.hasColors ) {
            meshMaterial = new THREE.MeshPhongMaterial( { opacity: geometry.alpha, vertexColors: THREE.VertexColors } );
        }

        var mesh = new THREE.Mesh( geometry, meshMaterial );

        mesh.position.set( 0.5, 0.2, 0 + refOffset );
        mesh.rotation.set( -Math.PI / 2, Math.PI / 2, 0 );
        mesh.scale.set( 0.3, 0.3, 0.3 );

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        scene.add( mesh );

    } );


    // Lights

    scene.add( new THREE.HemisphereLight( 0x443333, 0x111122 ) );

    addShadowedLight( 1, 1, 1, 0xffffff, 1.35 );
    addShadowedLight( 0.5, 1, -1, 0xffaa00, 1 );
    // renderer

    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setClearColor( scene.fog.color );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );

    renderer.gammaInput = true;
    renderer.gammaOutput = true;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.renderReverseSided = false;

    container.appendChild( renderer.domElement );


    // stats

    stats = new Stats();
    document.getElementById( "stats-output" ).appendChild( stats.dom );

    //
    window.addEventListener( 'resize', onWindowResize, false );

    // raycasting stuff
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    container.addEventListener( 'mousemove', onMouseMove, false );
    container.addEventListener( 'dblclick', onMouseLDClick, false );

    var geometry = new THREE.CylinderGeometry( 0, 0.2, 0.5, 3 );
    geometry.translate( 0, 0.2, 0 );
    //geometry.rotateX( Math.PI / 2 );
    helper = new THREE.Mesh( geometry, new THREE.MeshNormalMaterial() );
    scene.add( helper );



}

function addShadowedLight( x, y, z, color, intensity ) {

    var directionalLight = new THREE.DirectionalLight( color, intensity );
    directionalLight.position.set( x, y, z );
    scene.add( directionalLight );

    directionalLight.castShadow = true;

    var d = 1;
    directionalLight.shadow.camera.left = -d;
    directionalLight.shadow.camera.right = d;
    directionalLight.shadow.camera.top = d;
    directionalLight.shadow.camera.bottom = -d;

    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 4;

    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;

    directionalLight.shadow.bias = -0.005;

}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );
}

function animate() {

    requestAnimationFrame( animate );

    beforeRender();
    render();
    stats.update();

}

function beforeRender() {
    table.material.wireframe = gVar.wireframe;
}

function render() {

    var delta = clock.getDelta();
    orbitControl.update( delta );
    renderer.render( scene, camera );
}


function onMouseMove( event ) {

}

function onMouseLDClick( event ) {

    // Begin raycast
    mouse.x = ( event.clientX / renderer.domElement.clientWidth ) * 2 - 1;
    mouse.y = -( event.clientY / renderer.domElement.clientHeight ) * 2 + 1;
    raycaster.setFromCamera( mouse, camera );

    // See if the ray from the camera into the world hits one of our meshes
    var intersects = raycaster.intersectObject( table );

    // Toggle rotation bool for meshes that we clicked
    if ( intersects.length > 0 ) {

        //helper.position.set( 0, 0, 0 );
        //helper.lookAt( intersects[ 0 ].face.normal );

        //helper.position.copy( intersects[ 0 ].point );

    }

    // End raycast

    var extractGeo = extractOneMesh( table, intersects[ 0 ].face );
    var extractMesh = new THREE.Mesh( extractGeo, new THREE.MeshNormalMaterial());
    extractMesh.material.wireframe = true;
    scene.add( extractMesh );

    console.log("Table mesh has " + extractMesh.geometry.vertices.length + " vertices ");
    console.log("Table mesh has " + extractMesh.geometry.faces.length + " faces ");

    scene.remove( table );

}