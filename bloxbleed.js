(function () {
	let Vector2 = THREE.Vector2
	// Plugin variable
	let BloxBleedPlugin;


	// Converts x,y values to an rgba array.
	function xyToColor(texture, imageData, position) {
		let canvas = texture.canvas;
		let location = (canvas.width * position.y + position.x) * 4;
		let data = imageData.data;
		return { r: data[location], g: data[location + 1], b: data[location + 2], a: data[location + 3] };
	}

	// Replaces a color at x,y point in a 1D array, grabs the rgba color at that coordinate
	function replaceColor(texture, imageData, position, color) {
		let canvas = texture.canvas;
		let location = (canvas.width * position.y + position.x) * 4;
		let data = imageData.data;

		data[location] = color.r;
		data[location + 1] = color.g;
		data[location + 2] = color.b;
		data[location + 3] = color.a;
	}
	
	// --------------------------------------------------
	// There is most likely a better way to do these functions, but this is a quick tool I've put together
	
	const offsets = [
		new Vector2(-1, -1), // Top left
		new Vector2(1, -1), // Top left
		new Vector2(1, 1), // Bottom right
		new Vector2(-1, 1) // Bottom left
	]
	async function cornerHandler(texture, imageData, position, extents, index) {
		
		const extentsList = [extents.x.max, extents.y.max, extents.x.min, extents.y.min];

		const currExtent = extentsList[index];
		const isX = index % 2 === 0
		const axis = isX ? position.x : position.y;
		const axisDir = index > 1

		const direction = axisDir ? -1 : 1;
		const delta = offsets[index];
		const color = xyToColor(texture, imageData, position);
		
		replaceColor(texture, imageData, new Vector2(position.x, position.y + delta.y), color);
		replaceColor(texture, imageData, new Vector2(position.x + delta.x, position.y), color);
		replaceColor(texture, imageData, position.clone().add(delta), color);

		for (
			let i = axis + direction; 
			axisDir ? i >= currExtent : i <= currExtent; 
			i += direction
		) {
			let posi = isX ? new Vector2(i, position.y) : new Vector2(position.x, i);
			
			let sampleColor = xyToColor(texture, imageData, posi);
			let newPosition = isX ? new Vector2(i, posi.y + delta.y) : new Vector2(posi.x + delta.x, i);
			replaceColor(texture, imageData, newPosition, sampleColor);
		}
		
	}

	// Finds the minimum and maximum indices for a table with sparse values e.g {3:1,4:1,5:1} -- min index is 3, max index is 5
	// Used for getting the four corners of the UV in pixels
	function ObjectMinMax(matrix) {
		let min;
		let max;
		for (const pos of Object.entries(matrix)) {
			let index = parseInt(pos[0])
			if (index == undefined) {
				continue;
			}
			if (min == undefined || min > index) {
				min = index;
			}

			if (max == undefined || max < index) {
				max = index;
			}
		}
		return { min: min, max: max };
	};

	// Uses the face.Texture (GUID) class member to search the Project.textures for the Texture object
	function GetTexture(face) {
		let texture;
		Project.textures.forEach((j) => {
			if (j.uuid == face.texture && texture == undefined) {
				texture = j;
			}
		})
		return texture;
	};

	// Grabs all the textures associated with a list of meshes.
	function getAllMeshTextures(meshes) {
		let textures = new Set();
		meshes.forEach((v, i) => {
			
			for (const [key, value] of Object.entries(v.faces)) {
				let texture = GetTexture(value);
				textures.add(texture);
			}
		})
		return textures;
	};

	async function applyMargins(texture, occupationMatrix, textureData) {
		let imageData = textureData;
		
		// Get the extents of the UV by their pixel positions, in the top left/right bottom left/right corners.
		
		let xExtents = ObjectMinMax(occupationMatrix);
		let yExtents = ObjectMinMax(occupationMatrix[xExtents.min]);
		
		let extents = {x: xExtents, y: yExtents};
		const UVPixelCoords = [
			new THREE.Vector2(xExtents.min, yExtents.min),
			new THREE.Vector2(xExtents.max, yExtents.min),
			new THREE.Vector2(xExtents.max, yExtents.max),
			new THREE.Vector2(xExtents.min, yExtents.max),
		];
		
		await Promise.allSettled(
			UVPixelCoords.map(async (position, index) => {
				cornerHandler(texture, imageData, position, extents, index)
			})
		)
	}

	// Responsible for the creation of margins around the mesh UV.
	async function marginCreator(faces, texturePool, matrixPool) {
		// Get the texture from the texture list via the id given in face.texture
		
		await Promise.all(faces.map(async ([id, face]) => {
			let texture = GetTexture(face);
			// Converts the UV to their pixel position. It took me several hours to figure this out.
			let occupationMatrix = matrixPool.get(face);
			
			if (texture == undefined) {
				Undo.cancelEdit();
				return;
			}
			
			await modifyTextureData(texture, async (layer) => {
				let textureData = texturePool.get(layer);
				await applyMargins(layer, occupationMatrix, textureData);
			})
		}))
		
	}

	function modifyTextureData(texture, callback) {
		let layers = texture.layers
			
			 
		if (layers.length > 0) {
			layers.forEach((layer) => {
				let ctx = layer.ctx;
				let canvas = layer.canvas;
				callback(layer, ctx, canvas);
			})
		} else {
			let ctx = texture.ctx;
			let canvas = texture.canvas;
			callback(texture, ctx, canvas);
		}
	}

	async function bloxBleedActionClick() {
		let meshSelection = Mesh.selected;
		
		// This is to reduce memory use for texture clones with the Undo system
		// Saves only the textures from the selected meshes for Undoing.
		let textures = getAllMeshTextures(meshSelection);
		Undo.initEdit({textures : textures});
		let texturePool = new Map();
		
		textures.forEach((texture)=>{
			modifyTextureData(texture, (layer, ctx, canvas) => {
				texturePool.set(layer, ctx.getImageData(0, 0, canvas.width, canvas.height)); 
			})
		})
		
		await Promise.allSettled(meshSelection.map(async (mesh)=>{
			
			let matrixPool = new Map();
			let faces = Object.entries(mesh.faces)

			await Promise.all(
				faces.map(async ([id, face]) => {
					let occupy = face.getOccupationMatrix(true)
					matrixPool.set(face, occupy);
				})
			)
			marginCreator(faces, texturePool, matrixPool);
		}))
		
		textures.forEach((texture)=>{
			modifyTextureData(texture, (layer, ctx) => {
				let textureData = texturePool.get(layer);
				ctx.putImageData(textureData, 0, 0);
			})
			texture.updateChangesAfterEdit();
		})

		Undo.finishEdit("Bleeds the Texture.");
		UVEditor.message("Successfully bled");
	}

	function bloxBleedLoader() {
		BloxBleedPlugin = new Action("BloxBleed",
			{
				name: "BloxBleed",
				icon: 'icon',
				click: bloxBleedActionClick,
			})
		Toolbars.uv_editor.add(BloxBleedPlugin);
	}

	BBPlugin.register('bloxbleed', {
		title: 'BloxBleed',
		author: 'Crushmero',
		icon: 'icon',
		description: 'Bleeds the texture past the UV for software that interpolates textures\n\nName References: Roblox, Minecraft, texture bleeding, HeartBleed (buffer overflow)',
		version: '1.0.1',
		variant: 'desktop',
		onload: bloxBleedLoader,
		onunload: () => {
			BloxBleedPlugin.delete();
		}
	})
})()
