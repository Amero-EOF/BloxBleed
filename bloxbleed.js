
(function () {
	// Plugin variable
	let BloxBleedPlugin;


	// Converts x,y values to an rgba array.
	function xyToColor(texture, imageData, x, y) {
		let canvas = texture.canvas;
		let location = (canvas.width * y + x) * 4;
		let data = imageData.data;
		return { r: data[location], g: data[location + 1], b: data[location + 2], a: data[location + 3] };
	}

	// Replaces a color at x,y point in a 1D array, grabs the rgba color at that coordinate
	function replaceColor(texture, imageData, x, y, color) {
		let canvas = texture.canvas;
		let location = (canvas.width * y + x) * 4;
		let data = imageData.data;

		data[location] = color.r;
		data[location + 1] = color.g;
		data[location + 2] = color.b;
		data[location + 3] = color.a;
	}

	// --------------------------------------------------
	// There is most likely a better way to do these functions, but this is a quick tool I've put together
	
	function topRight(texture, imageData, x, y, xExtents, yExtents) {
		// console.log("Top Right Values:")
		let color = xyToColor(texture, imageData, x, y);
		replaceColor(texture, imageData, x, y - 1, color);
		replaceColor(texture, imageData, x + 1, y, color);
		replaceColor(texture, imageData, x + 1, y - 1, color);
		for (let i = y + 1; i <= yExtents.max; i++) {
			let sampleColor = xyToColor(texture, imageData, x, i);
			replaceColor(texture, imageData, x + 1, i, sampleColor);
		}
	}

	function topLeft(texture, imageData, x, y, xExtents, yExtents) {
		// console.log("Top Left Values:")
		let color = xyToColor(texture, imageData, x, y);
		replaceColor(texture, imageData, x, y - 1, color);
		replaceColor(texture, imageData, x - 1, y, color);
		replaceColor(texture, imageData, x - 1, y - 1, color);

		// console.log(xExtents.max)
		for (let i = x + 1; i <= xExtents.max; i++) {
			let sampleColor = xyToColor(texture, imageData, i, y);
			replaceColor(texture, imageData, i, y - 1, sampleColor);
		}
	}

	function bottomRight(texture, imageData, x, y, xExtents, yExtents) {
		// console.log("Bottom Right Values:")
		let color = xyToColor(texture, imageData, x, y);
		replaceColor(texture, imageData, x, y + 1, color);
		replaceColor(texture, imageData, x + 1, y, color);
		replaceColor(texture, imageData, x + 1, y + 1, color);
		// console.log(xExtents.max)
		for (let i = x - 1; i >= xExtents.min; i--) {
			let sampleColor = xyToColor(texture, imageData, i, y);
			replaceColor(texture, imageData, i, y + 1, sampleColor);
		}
	};

	function bottomLeft(texture, imageData, x, y, xExtents, yExtents) {
		// console.log("Bottom Left Values:")
		let color = xyToColor(texture, imageData, x, y);
		replaceColor(texture, imageData, x, y + 1, color);
		replaceColor(texture, imageData, x - 1, y, color);
		replaceColor(texture, imageData, x - 1, y + 1, color);
		for (let i = y - 1; i >= yExtents.min; i--) {
			let sampleColor = xyToColor(texture, imageData, x, i);
			replaceColor(texture, imageData, x - 1, i, sampleColor);
		}
	};

	// --------------------------------------------------

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
			console.log(index)
			if (min == undefined || min > index) {
				min = index;
				console.log(min);
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
		Project.textures.forEach((j, k) => {
			if (j.uuid == face.texture && texture == undefined) {
				texture = j;
			}
		})
		return texture;
	};

	// Grabs all the textures associated with a list of meshes.
	function getAllMeshTextures(meshes) {
		let textures = [];
		meshes.forEach((v, i) => {
			
			for (const [key, value] of Object.entries(v.faces)) {
				let texture = GetTexture(value);
				textures[textures.length + 1] = texture;
			}
		})
		return textures;
	};

	// lookup table based on the index in the UVPixelCoords table below.
	let marginFuncLUT = [
		topLeft,
		topRight,
		bottomRight,
		bottomLeft
	]


	// Responsible for the creation of margins around the mesh UV.
	function marginCreator(mesh) {

		for (const [key, value] of Object.entries(mesh.faces)) {

			// Get the texture from the texture list via the id given in face.texture
			let texture = GetTexture(value);

			if (texture == undefined) {
				Undo.cancelEdit();
				return;
			}

			let ctx = texture.ctx;
			let canvas = texture.canvas;
			// let ctx = canvas.getContext('2d');
			let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			console.log();

			// Converts the UV to their pixel position. It took me several hours to figure this out.
			let occupationMatrix = value.getOccupationMatrix(true);
			console.log(occupationMatrix);
			// Get the extents of the UV by their pixel positions, in the top left/right bottom left/right corners.
			let xExtents = ObjectMinMax(occupationMatrix);
			let yExtents = ObjectMinMax(occupationMatrix[xExtents.min]);

			UVPixelCoords = [
				{
					x: xExtents.min,
					y: yExtents.min
				},
				{
					x: xExtents.max,
					y: yExtents.min
				},
				{
					x: xExtents.max,
					y: yExtents.max
				},
				{
					x: xExtents.min,
					y: yExtents.max
				},
			];

			UVPixelCoords.forEach((vertex, index) => {
				console.log(vertex, index)

				let x = vertex.x;
				let y = vertex.y;

				marginFuncLUT[index](texture,imageData,x,y,xExtents,yExtents)
			})

			ctx.putImageData(imageData, 0, 0);
			texture.updateChangesAfterEdit();
		}
	}

	

	function bloxBleedActionClick() {
		UVEditor.message("<h1 style='#FF0000'>Hey guys</h1>");
		
		let meshSelection = Mesh.selected;

		// This is to reduce memory use for texture clones with the Undo system
		// Saves only the textures from the selected meshes for Undoing.
		let textures = getAllMeshTextures(meshSelection);
		Undo.initEdit({textures:textures});

		meshSelection.forEach(marginCreator)

		Undo.finishEdit("Bleeds the Texture.")
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
